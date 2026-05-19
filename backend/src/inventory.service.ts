import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';

import { PrismaService } from './prisma.service';
import { LedgerReasonCode, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

interface LedgerEntryInput {
  variantId: string;
  shelfId: string;
  delta: number;
  reasonCode: LedgerReasonCode;
  performedById?: string;
}

interface DeductStockInput {
  variantId: string;
  shelfId: string;
  quantity: number;
  reasonCode: LedgerReasonCode;
  performedById?: string;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── GET STOCK ──────────────────────────────────────────────

  async getStockByVariant(variantId: string) {
    const stocks = await this.prisma.inventoryStock.findMany({
      where: { variantId },
      include: {
        shelf: {
          include: {
            rack: {
              include: {
                zone: {
                  include: { warehouse: true },
                },
              },
            },
          },
        },
        variant: {
          include: {
            product: { select: { name: true } },
          },
        },
      },
    });

    return stocks.map((s) => ({
      ...s,
      quantityOnHand: s.quantityAvailable + s.quantityReserved,
      // Fixed: Mapped properties to match correct prisma schema fields (zoneCode, rackIdentifier, shelfNumber)
      location: `${s.shelf.rack.zone.warehouse.name} → ${s.shelf.rack.zone.zoneCode} → ${s.shelf.rack.rackIdentifier} → ${s.shelf.shelfNumber}`,
    }));
  }

  async getLowStockItems(warehouseId?: string) {
    const stocks = await this.prisma.inventoryStock.findMany({
      where: {
        ...(warehouseId
          ? {
              shelf: {
                rack: {
                  zone: { warehouseId },
                },
              },
            }
          : {}),
      },
      include: {
        variant: {
          include: { product: { select: { name: true } } },
        },
        shelf: {
          include: {
            rack: {
              include: { zone: { include: { warehouse: { select: { name: true } } } } },
            },
          },
        },
      },
      orderBy: { quantityAvailable: 'asc' },
    });

    // Filter where available <= reorderPoint in app layer for database-agnostic comparison
    return stocks.filter((s) => s.quantityAvailable <= s.reorderPoint);
  }

  // ─── ATOMIC DEDUCT (Race-condition safe) ────────────────────

  /**
   * The critical inventory deduction function.
   * Uses Prisma's $executeRaw to safely decrement quantities
   * and writes the transactional ledger entry.
   */
  async atomicDeductStock(input: DeductStockInput): Promise<void> {
    const {
      variantId,
      shelfId,
      quantity,
      reasonCode,
      performedById,
    } = input;

    await this.prisma.$transaction(
      async (tx) => {
        // ── STEP 1: Update and subtract with raw query, preventing double-sell ──────
        const result = await tx.$executeRaw`
          UPDATE inventory_stocks
          SET quantity_available = quantity_available - ${quantity}
          WHERE variant_id = ${variantId}::uuid
            AND shelf_id   = ${shelfId}::uuid
            AND quantity_available >= ${quantity}
        `;

        if (result === 0) {
          throw new BadRequestException(
            `Insufficient stock for variant ${variantId} on shelf ${shelfId}`,
          );
        }

        // ── STEP 2: Write immutable ledger entry matching schema parameters ─────────────
        await tx.inventoryLedger.create({
          data: {
            variantId,
            shelfId,
            quantityDelta: -quantity,
            reasonCode,
            userId: performedById,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  // ─── RESERVE STOCK (for online orders) ──────────────────────

  async reserveStock(variantId: string, shelfId: string, quantity: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const stock = await tx.$executeRaw`
        UPDATE inventory_stocks
        SET quantity_available = quantity_available - ${quantity},
            quantity_reserved  = quantity_reserved  + ${quantity}
        WHERE variant_id        = ${variantId}::uuid
          AND shelf_id          = ${shelfId}::uuid
          AND quantity_available >= ${quantity}
      `;
      if (stock === 0) {
        throw new BadRequestException('Cannot reserve: insufficient available stock');
      }
    });
  }

  // ─── ADD STOCK (PO receipt, returns) ────────────────────────

  async addStock(input: LedgerEntryInput): Promise<void> {
    const { variantId, shelfId, delta, reasonCode, performedById } = input;

    if (delta <= 0) throw new BadRequestException('Delta must be positive for stock additions');

    await this.prisma.$transaction(async (tx) => {
      // Upsert stock row
      await tx.inventoryStock.upsert({
        where: { variantId_shelfId: { variantId, shelfId } },
        update: { quantityAvailable: { increment: delta } },
        create: {
          variantId,
          shelfId,
          quantityAvailable: delta,
          quantityReserved: 0,
        },
      });

      // Write matching inventory ledger entry
      await tx.inventoryLedger.create({
        data: {
          variantId,
          shelfId,
          quantityDelta: delta,
          reasonCode,
          userId: performedById,
        },
      });
    });
  }

  // ─── LEDGER HISTORY ─────────────────────────────────────────

  async getLedgerHistory(
    variantId: string,
    options: { skip?: number; take?: number; fromDate?: Date; toDate?: Date },
  ) {
    const { skip = 0, take = 50, fromDate, toDate } = options;

    return this.prisma.inventoryLedger.findMany({
      where: {
        variantId,
        ...(fromDate || toDate
          ? {
              timestamp: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      include: {
        shelf: {
          include: {
            rack: { include: { zone: { include: { warehouse: { select: { name: true } } } } } },
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      skip,
      take,
    });
  }

  // ─── INVENTORY AUDIT ─────────────────────────────────────────

  async createAudit(warehouseId: string, conductedById: string) {
    // Note: Since InventoryAudit / InventoryAuditRow models are missing from the schema,
    // we log a warning and return a mock structure to prevent application startup breakage.
    this.logger.warn(
      `createAudit called but InventoryAudit / InventoryAuditRow models do not exist in the current Prisma schema.`,
    );

    return {
      warehouseId,
      conductedById,
      rows: [],
      message: 'Audit logging table missing in Prisma schema.',
    };
  }

  async updateAuditRow(
    auditId: string,
    variantId: string,
    shelfId: string,
    physicalCount: number,
    conductedById: string,
  ) {
    this.logger.warn(
      `updateAuditRow called but InventoryAudit / InventoryAuditRow models do not exist in the current Prisma schema.`,
    );

    return {
      auditId,
      variantId,
      shelfId,
      physicalCount,
      variance: 0,
      message: 'Audit row table missing in Prisma schema.',
    };
  }

  // ─── SCRAP / WRITE-OFF ───────────────────────────────────────

  async recordScrap(data: {
    variantId: string;
    shelfId: string;
    warehouseId: string;
    quantity: number;
    reason: string;
    notes?: string;
    reportedById: string;
  }) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: data.variantId },
      select: { baseCost: true },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    const cogsOffsetValue = Number(variant.baseCost) * data.quantity;

    return this.prisma.$transaction(async (tx) => {
      // Deduct stock atomically
      const result = await tx.$executeRaw`
        UPDATE inventory_stocks
        SET quantity_available = quantity_available - ${data.quantity}
        WHERE variant_id = ${data.variantId}::uuid
          AND shelf_id = ${data.shelfId}::uuid
          AND quantity_available >= ${data.quantity}
      `;

      if (result === 0) {
        throw new BadRequestException('Insufficient stock available to scrap');
      }

      // Ledger entry
      const ledger = await tx.inventoryLedger.create({
        data: {
          variantId: data.variantId,
          shelfId: data.shelfId,
          quantityDelta: -data.quantity,
          reasonCode: LedgerReasonCode.SCRAP_WRITEOFF,
          userId: data.reportedById,
        },
      });

      // Scrap logs do not have an explicit schema model, so we simulate the ScrapLog returning structure
      return {
        id: ledger.id,
        variantId: data.variantId,
        shelfId: data.shelfId,
        warehouseId: data.warehouseId,
        quantity: data.quantity,
        reason: data.reason,
        cogsOffsetValue,
        notes: data.notes,
        reportedById: data.reportedById,
        timestamp: ledger.timestamp,
      };
    });
  }
}