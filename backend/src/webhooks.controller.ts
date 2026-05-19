import {
  Controller,
  Post,
  Headers,
  Body,
  RawBodyRequest,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from './prisma.service';
import { OrderRoutingService } from './order-routing.service';
import { InventoryService } from './inventory.service';
import * as crypto from 'crypto';
import { Request } from 'express';
import { LedgerReasonCode, OrderSource, OrderStatus } from '@prisma/client';
import Decimal from 'decimal.js';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: OrderRoutingService,
    private readonly inventoryService: InventoryService,
    @InjectQueue('whatsapp') private readonly whatsappQueue: Queue,
    @InjectQueue('shopify-sync') private readonly shopifyQueue: Queue,
  ) {}

  /**
   * Shopify orders/paid webhook
   * Always returns 200 immediately — all work is async
   */
  @Post('shopify/orders-paid')
  @HttpCode(HttpStatus.OK)
  async handleShopifyOrderPaid(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Headers('x-shopify-webhook-id') webhookId: string,
    @Body() payload: any,
  ) {
    // ── 1. HMAC Signature Verification ───────────────────────
    this.verifyShopifyHmac(req.rawBody, hmac);

    // ── 2. Idempotency check ──────────────────────────────────
    if (webhookId) {
      // FIX: Check idempotency on the Order model, as it has the unique idempotencyKey field
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey: `shopify:${webhookId}` },
      });
      if (existing) {
        this.logger.log(`Duplicate Shopify webhook ignored: ${webhookId}`);
        return { status: 'duplicate_ignored' };
      }
    }

    // ── 3. Enqueue heavy processing (non-blocking response) ───
    await this.shopifyQueue.add(
      'ingest-shopify-order',
      { payload, webhookId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return { status: 'accepted' };
  }

  /**
   * Shopify inventory level sync (inbound)
   */
  @Post('shopify/inventory-levels-update')
  @HttpCode(HttpStatus.OK)
  async handleInventoryUpdate(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Body() payload: any,
  ) {
    this.verifyShopifyHmac(req.rawBody, hmac);
    this.logger.log(`Shopify inventory update: locationId=${payload.location_id}`);
    return { status: 'accepted' };
  }

  // ─── HMAC VERIFICATION ───────────────────────────────────────

  private verifyShopifyHmac(rawBody: Buffer | undefined, receivedHmac: string): void {
    if (!rawBody) throw new BadRequestException('Missing request body');
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('Shopify webhook secret not configured');

    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(receivedHmac ?? ''),
    );

    if (!isValid) throw new BadRequestException('Invalid Shopify HMAC signature');
  }
}

// ─── SHOPIFY ORDER PROCESSING WORKER ─────────────────────────

import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('shopify-sync')
export class ShopifyOrderProcessor {
  private readonly logger = new Logger(ShopifyOrderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: OrderRoutingService,
    private readonly inventoryService: InventoryService,
  ) {}

  @Process('ingest-shopify-order')
  async processShopifyOrder(job: Job<{ payload: any; webhookId: string }>) {
    const { payload, webhookId } = job.data;
    this.logger.log(`Processing Shopify order: ${payload.id}`);

    try {
      // Parse Shopify order
      const shopifyOrder = payload;
      const lineItems: { variantId: string; quantity: number }[] = [];

      for (const item of shopifyOrder.line_items) {
        const variant = await this.prisma.productVariant.findFirst({
          where: { shopifyVariantId: String(item.variant_id) },
        });
        if (variant) {
          lineItems.push({ variantId: variant.id, quantity: item.quantity });
        }
      }

      if (lineItems.length === 0) {
        this.logger.warn(`No matching variants for Shopify order ${shopifyOrder.id}`);
        return;
      }

      // Extract shipping coordinates (from pincode, or use default)
      const shippingAddress = {
        latitude: parseFloat(shopifyOrder.shipping_address?.latitude ?? '0'),
        longitude: parseFloat(shopifyOrder.shipping_address?.longitude ?? '0'),
        pincode: shopifyOrder.shipping_address?.zip,
      };

      // Route order
      const routing = await this.routingService.routeOrder(lineItems, shippingAddress, {
        allowSplitShipment: true,
      });

      // Create order in DB (Aligned to Prisma Schema)
      const order = await this.prisma.order.create({
        data: {
          customerPhone: shopifyOrder.customer?.phone || null,
          source: OrderSource.SHOPIFY,
          status: routing.type === 'AWAITING_STOCK' ? OrderStatus.PENDING : OrderStatus.PROCESSING,
          warehouseId: routing.primaryWarehouseId,
          idempotencyKey: `shopify:${webhookId}`,
          subtotal: new Decimal(shopifyOrder.subtotal_price),
          gstTax: new Decimal(shopifyOrder.total_tax),
          total: new Decimal(shopifyOrder.total_price),
          items: {
            createMany: {
              data: lineItems.map((item) => {
                const shopifyItem = shopifyOrder.line_items.find(
                  (li: any) => li.variant_id?.toString() === item.variantId,
                );
                return {
                  variantId: item.variantId,
                  quantityOrdered: item.quantity,
                  unitPrice: shopifyItem?.price ?? 0,
                };
              }),
            },
          },
        },
      });

      // Deduct inventory atomically
      for (const assignment of routing.assignments) {
        for (const item of assignment.items) {
          // FIX: Removed fields that are not part of the schema (referenceId, referenceType, idempotencyKey)
          await this.inventoryService.atomicDeductStock({
            variantId: item.variantId,
            shelfId: item.shelfId,
            quantity: item.quantity,
            reasonCode: LedgerReasonCode.SHOPIFY_SALE,
          });
        }
      }

      this.logger.log(`Shopify order ${shopifyOrder.id} processed → local order ${order.id}`);
    } catch (err: any) {
      this.logger.error(`Failed to process Shopify order: ${err.message}`, err.stack);
      throw err; // BullMQ will retry
    }
  }

  @Process('sync-pos-sale')
  async syncPosToShopify(job: Job<{ orderId: string; items: any[] }>) {
    const { orderId, items } = job.data;
    this.logger.log(`Syncing POS sale ${orderId} to Shopify`);

    const shopifyApiUrl = process.env.SHOPIFY_STORE_URL;
    const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!shopifyApiUrl || !shopifyToken) return;

    for (const item of items) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: item.variantId },
        select: { shopifyVariantId: true },
      });
      if (!variant?.shopifyVariantId) continue;

      const stock = await this.prisma.inventoryStock.findFirst({
        where: { variantId: item.variantId },
        select: { quantityAvailable: true },
      });

      // Push updated level to Shopify
      try {
        const response = await fetch(
          `${shopifyApiUrl}/admin/api/2024-01/inventory_levels/set.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': shopifyToken,
            },
            body: JSON.stringify({
              location_id: process.env.SHOPIFY_LOCATION_ID,
              inventory_item_id: variant.shopifyVariantId,
              available: stock?.quantityAvailable ?? 0,
            }),
          },
        );
        if (!response.ok) {
          this.logger.error(`Shopify sync failed: ${response.statusText}`);
        }
      } catch (err: any) {
        this.logger.error(`Shopify API error: ${err.message}`);
        throw err;
      }
    }
  }
}