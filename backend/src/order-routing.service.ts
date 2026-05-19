import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from './prisma.service';
import { WarehouseType } from '@prisma/client';

interface OrderItem {
  variantId: string;
  quantity: number;
}

interface ShippingAddress {
  latitude: number;
  longitude: number;
  pincode?: string;
}

interface RoutingResult {
  type: 'SINGLE_NODE' | 'SPLIT_SHIPMENT' | 'AWAITING_STOCK';
  assignments: NodeAssignment[];
  primaryWarehouseId?: string;
}

interface NodeAssignment {
  warehouseId: string;
  items: { variantId: string; quantity: number; shelfId: string }[];
}

interface WarehouseCandidate {
  id: string;
  name: string;
  type: WarehouseType;
  latitude: number;
  longitude: number;
  distance?: number;
  priorityScore?: number;
  coverableItems?: { variantId: string; quantity: number; shelfId: string }[];
}

// Node priority weights — lower = higher priority
const PRIORITY_WEIGHT: Record<WarehouseType, number> = {
  FULFILLMENT_CENTER: 1,
  DARK_STORE: 2,
  RETAIL_STORE: 3,
};

@Injectable()
export class OrderRoutingService {
  private readonly logger = new Logger(OrderRoutingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * MAIN ROUTING ENTRY POINT
   * 4-phase deterministic routing algorithm
   */
  async routeOrder(
    items: OrderItem[],
    shippingAddress: ShippingAddress,
    options?: {
      posWarehouseId?: string;    // Phase 1 — POS override
      allowSplitShipment?: boolean;
      primaryHubId?: string;
    },
  ): Promise<RoutingResult> {
    // ── PHASE 1: POS LOCAL TERMINAL OVERRIDE ─────────────────
    if (options?.posWarehouseId) {
      this.logger.log(`Phase 1: POS override → warehouse ${options.posWarehouseId}`);
      const assignments = await this.buildAssignment(options.posWarehouseId, items);
      return {
        type: 'SINGLE_NODE',
        primaryWarehouseId: options.posWarehouseId,
        assignments: [{ warehouseId: options.posWarehouseId, items: assignments }],
      };
    }

    // ── PHASE 2: INVENTORY VIABILITY FILTRATION ───────────────
    this.logger.log('Phase 2: Finding viable warehouse candidates');
    const viableWarehouses = await this.findViableWarehouses(items);

    if (viableWarehouses.length > 0) {
      // ── PHASE 3: PRIORITY + GEOSPATIAL SORT ─────────────────
      this.logger.log(`Phase 3: Sorting ${viableWarehouses.length} candidates`);
      const ranked = this.rankWarehouses(viableWarehouses, shippingAddress);
      const winner = ranked[0];

      this.logger.log(`Phase 3 winner: ${winner.name} (${winner.type}, dist=${winner.distance?.toFixed(2)}km)`);

      const assignments = await this.buildAssignment(winner.id, items);
      return {
        type: 'SINGLE_NODE',
        primaryWarehouseId: winner.id,
        assignments: [{ warehouseId: winner.id, items: assignments }],
      };
    }

    // ── PHASE 4: FALLBACK SPLIT-SHIPMENT PROTOCOL ─────────────
    this.logger.log('Phase 4: No single viable node — initiating split-shipment');
    return this.handleFallback(items, shippingAddress, options);
  }

  // ─── PHASE 2: Find warehouses that can fulfill ALL items ────

  private async findViableWarehouses(items: OrderItem[]): Promise<WarehouseCandidate[]> {
    // For each item, find warehouses with enough stock
    // A warehouse is only viable if it can cover EVERY item

    const itemChecks = await Promise.all(
      items.map((item) =>
        this.prisma.inventoryStock.findMany({
          where: {
            variantId: item.variantId,
            quantityAvailable: { gte: item.quantity },
            // Moved active warehouse condition here instead of inside the "include" structure
            shelf: {
              rack: {
                zone: {
                  warehouse: {
                    isActive: true,
                  },
                },
              },
            },
          },
          include: {
            shelf: {
              include: {
                rack: {
                  include: {
                    zone: true, // We don't need to load the whole warehouse model since we only need warehouseId
                  },
                },
              },
            },
          },
        }),
      ),
    );

    // Intersect: only warehouses appearing in ALL item checks
    const warehouseIdSets = itemChecks.map(
      (stocks) => new Set(stocks.map((s) => s.shelf.rack.zone.warehouseId)),
    );

    const viableIds = [...warehouseIdSets[0]].filter((id) =>
      warehouseIdSets.every((set) => set.has(id)),
    );

    if (viableIds.length === 0) return [];

    // Load full warehouse details
    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: viableIds }, isActive: true },
    });

    return warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      latitude: Number(w.latitude),
      longitude: Number(w.longitude),
    }));
  }

  // ─── PHASE 3: Sort by priority + Haversine distance ─────────

  private rankWarehouses(
    candidates: WarehouseCandidate[],
    destination: ShippingAddress,
  ): WarehouseCandidate[] {
    return candidates
      .map((w) => ({
        ...w,
        distance: this.haversineKm(
          destination.latitude,
          destination.longitude,
          w.latitude,
          w.longitude,
        ),
        priorityScore: PRIORITY_WEIGHT[w.type],
      }))
      .sort((a, b) => {
        // Primary sort: priority type
        if (a.priorityScore !== b.priorityScore) return a.priorityScore! - b.priorityScore!;
        // Secondary sort: proximity
        return (a.distance ?? 0) - (b.distance ?? 0);
      });
  }

  // ─── PHASE 4: Greedy split-shipment / backorder ──────────────

  private async handleFallback(
    items: OrderItem[],
    shippingAddress: ShippingAddress,
    options?: { allowSplitShipment?: boolean; primaryHubId?: string },
  ): Promise<RoutingResult> {
    if (!options?.allowSplitShipment) {
      // Route to primary hub, mark awaiting stock
      const primaryHub = options?.primaryHubId ?? (await this.getPrimaryHub());
      return {
        type: 'AWAITING_STOCK',
        primaryWarehouseId: primaryHub,
        assignments: [],
      };
    }

    // Greedy: find minimum warehouse set to cover all items
    const assignments = await this.greedySplitAssignment(items, shippingAddress);
    return { type: 'SPLIT_SHIPMENT', assignments };
  }

  /**
   * Greedy algorithm: minimise the number of warehouses needed
   * to cover all items in the basket.
   */
  private async greedySplitAssignment(
    items: OrderItem[],
    shippingAddress: ShippingAddress,
  ): Promise<NodeAssignment[]> {
    const remaining = new Map(items.map((i) => [i.variantId, i.quantity]));
    const assignments: NodeAssignment[] = [];

    while (remaining.size > 0) {
      // For each remaining item, fetch partial stock locations
      const partialItems = [...remaining.entries()].map(([variantId, quantity]) => ({
        variantId,
        quantity,
      }));

      const candidates = await this.getCandidatesForPartialFulfillment(partialItems);
      if (candidates.length === 0) break;

      const ranked = this.rankWarehouses(candidates, shippingAddress);
      const best = ranked[0];

      const warehouseItems: NodeAssignment['items'] = [];

      for (const [variantId, neededQty] of remaining) {
        const stock = await this.prisma.inventoryStock.findFirst({
          where: {
            variantId,
            shelf: { rack: { zone: { warehouseId: best.id } } },
            quantityAvailable: { gt: 0 },
          },
          orderBy: { quantityAvailable: 'desc' },
        });

        if (stock && stock.quantityAvailable > 0) {
          const fulfillQty = Math.min(stock.quantityAvailable, neededQty);
          warehouseItems.push({ variantId, quantity: fulfillQty, shelfId: stock.shelfId });

          if (fulfillQty >= neededQty) {
            remaining.delete(variantId);
          } else {
            remaining.set(variantId, neededQty - fulfillQty);
          }
        }
      }

      assignments.push({ warehouseId: best.id, items: warehouseItems });
    }

    return assignments;
  }

  private async getCandidatesForPartialFulfillment(
    items: OrderItem[],
  ): Promise<WarehouseCandidate[]> {
    const allWarehouseIds = new Set<string>();

    for (const item of items) {
      const stocks = await this.prisma.inventoryStock.findMany({
        where: { variantId: item.variantId, quantityAvailable: { gt: 0 } },
        include: { shelf: { include: { rack: { include: { zone: true } } } } },
      });
      stocks.forEach((s) => allWarehouseIds.add(s.shelf.rack.zone.warehouseId));
    }

    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: [...allWarehouseIds] }, isActive: true },
    });

    return warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      latitude: Number(w.latitude),
      longitude: Number(w.longitude),
    }));
  }

  private async buildAssignment(
    warehouseId: string,
    items: OrderItem[],
  ): Promise<NodeAssignment['items']> {
    const result: NodeAssignment['items'] = [];
    for (const item of items) {
      // Pick the shelf with the highest available stock in this warehouse
      const stock = await this.prisma.inventoryStock.findFirst({
        where: {
          variantId: item.variantId,
          shelf: { rack: { zone: { warehouseId } } },
          quantityAvailable: { gte: item.quantity },
        },
        orderBy: { quantityAvailable: 'desc' },
      });
      if (stock) {
        result.push({ variantId: item.variantId, quantity: item.quantity, shelfId: stock.shelfId });
      }
    }
    return result;
  }

  private async getPrimaryHub(): Promise<string> {
    // Fixed: 'isPrimary' does not exist in schema. Prisma queries FULFILLMENT_CENTER instead.
    const hub = await this.prisma.warehouse.findFirst({
      where: { type: 'FULFILLMENT_CENTER', isActive: true },
    });
    
    if (hub) return hub.id;

    // Direct fallback to first active warehouse if no fulfillment hub is configured
    const defaultHub = await this.prisma.warehouse.findFirst({
      where: { isActive: true },
    });

    if (!defaultHub) throw new Error('No active warehouses configured in system');
    return defaultHub.id;
  }

  // ─── HAVERSINE FORMULA ────────────────────────────────────────

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}