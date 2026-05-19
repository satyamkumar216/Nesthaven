// pos.service.ts — full replacement

import {
  Injectable, Logger, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { InventoryService } from './inventory.service';
import { OrderRoutingService } from './order-routing.service';
import { OrderSource, OrderStatus, LedgerReasonCode } from '@prisma/client';
import Decimal from 'decimal.js';

interface CheckoutItem {
  variantId: string;
  quantity: number;
}

interface SplitPayment {
  method: 'CASH' | 'UPI' | 'CARD';
  amount: number;
}

interface CheckoutPayload {
  warehouseId: string;
  cashierId: string;
  customerId?: string;
  items: CheckoutItem[];
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'SPLIT';
  splitPayments?: SplitPayment[];
  loyaltyPointsToRedeem?: number;
  idempotencyKey: string;
}

const GST_RATE = 0.18;

@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly routingService: OrderRoutingService,
  ) {}

  async processCheckout(payload: CheckoutPayload) {
    const {
      warehouseId, cashierId, customerId, items,
      paymentMethod, splitPayments, loyaltyPointsToRedeem = 0,
      idempotencyKey,
    } = payload;

    // ── 1. Idempotency check ──────────────────────────────────
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: `pos:${idempotencyKey}` },
    });
    if (existing) {
      this.logger.warn(`Duplicate POS checkout ignored: ${idempotencyKey}`);
      return { orderId: existing.id, duplicate: true };
    }

    // ── 2. Validate split payment totals ─────────────────────
    if (paymentMethod === 'SPLIT') {
      if (!splitPayments?.length) {
        throw new BadRequestException('Split payments array required');
      }
    }

    // ── 3. Load variants & prices ────────────────────────────
    const variantIds = items.map((i) => i.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, retailPrice: true, baseCost: true, sku: true },
    });

    if (variants.length !== variantIds.length) {
      throw new NotFoundException('One or more product variants not found');
    }

    const variantMap = new Map(variants.map((v) => [v.id, v]));

    // ── 4. Calculate totals ───────────────────────────────────
    let subtotal = new Decimal(0);
    for (const item of items) {
      const variant = variantMap.get(item.variantId)!;
      subtotal = subtotal.plus(
        new Decimal(String(variant.retailPrice)).times(item.quantity)
      );
    }

    const loyaltyDiscount = new Decimal(loyaltyPointsToRedeem).times(0.1);
    const discountedSubtotal = subtotal.minus(loyaltyDiscount);
    const gstAmount = discountedSubtotal.times(GST_RATE);
    const total = discountedSubtotal.plus(gstAmount);

    // ── 5. Route to warehouse (POS override) ─────────────────
    const routing = await this.routingService.routeOrder(
      items,
      { latitude: 0, longitude: 0 }, // POS doesn't need geospatial routing
      { posWarehouseId: warehouseId },
    );

    if (routing.assignments.length === 0) {
      throw new BadRequestException(
        'Cannot fulfill order: insufficient stock at this location',
      );
    }

    // ── 6. Persist order + deduct inventory (single transaction) ─
    const order = await this.prisma.$transaction(async (tx) => {
      // Create the order
      const newOrder = await tx.order.create({
        data: {
          source: OrderSource.POS,
          status: OrderStatus.DELIVERED, // POS = immediate fulfilment
          warehouseId,
          idempotencyKey: `pos:${idempotencyKey}`,
          subtotal: discountedSubtotal,
          gstTax: gstAmount,
          total,
          ...(customerId ? { customerId } : {}),
          items: {
            createMany: {
              data: items.map((item) => ({
                variantId: item.variantId,
                quantityOrdered: item.quantity,
                unitPrice: variantMap.get(item.variantId)!.retailPrice,
              })),
            },
          },
        },
      });

      // Deduct loyalty points used
      if (customerId && loyaltyPointsToRedeem > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: { decrement: loyaltyPointsToRedeem } },
        });
      }

      // Award loyalty points (1 point per ₹10 spent)
      if (customerId) {
        const pointsEarned = Math.floor(total.toNumber() / 10);
        await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: { increment: pointsEarned } },
        });
      }

      return newOrder;
    });

    // ── 7. Atomic inventory deduction (outside transaction for perf) ──
    for (const assignment of routing.assignments) {
      for (const item of assignment.items) {
        await this.inventoryService.atomicDeductStock({
          variantId: item.variantId,
          shelfId: item.shelfId,
          quantity: item.quantity,
          reasonCode: LedgerReasonCode.POS_SALE,
          performedById: cashierId,
        });
      }
    }

    this.logger.log(`POS checkout complete — order ${order.id}, total ₹${total.toFixed(2)}`);

    return {
      orderId: order.id,
      orderNumber: order.id.slice(0, 8).toUpperCase(),
      total: total.toFixed(2),
      gst: gstAmount.toFixed(2),
      paymentMethod,
    };
  }
}