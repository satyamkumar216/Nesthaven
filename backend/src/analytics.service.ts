import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import Decimal from 'decimal.js';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── EXECUTIVE DASHBOARD ─────────────────────────────────────

  async getDashboardSummary(warehouseId?: string) {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const [
      todayOrders,
      posRevenue,
      onlineRevenue,
      totalProducts,
      lowStockCount,
      weeklyRevenue,
      topProducts,
    ] = await Promise.all([
      // Today's orders
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: startOfDay, lte: endOfDay },
          status: { not: 'CANCELLED' },
          ...(warehouseId ? { warehouseId } : {}),
        },
        _count: { id: true },
        _sum: { total: true },
      }),

      // POS revenue today
      this.prisma.order.aggregate({
        where: {
          source: 'POS',
          createdAt: { gte: startOfDay, lte: endOfDay },
          status: { not: 'CANCELLED' },
          ...(warehouseId ? { warehouseId } : {}),
        },
        _sum: { total: true },
      }),

      // Online revenue today
      this.prisma.order.aggregate({
        where: {
          source: 'SHOPIFY',
          createdAt: { gte: startOfDay, lte: endOfDay },
          status: { not: 'CANCELLED' },
        },
        _sum: { total: true },
      }),

      // Total products
      this.prisma.product.count(),

      // Low stock items
      this.prisma.inventoryStock.count({
        where: { quantityAvailable: { lte: 5 } },
      }),

      // 7-day revenue trend
      this.get7DayRevenueTrend(warehouseId),

      // Top selling products
      this.getTopProducts(5),
    ]);

    const totalRevenue = new Decimal(String(todayOrders._sum.total ?? 0));
    const posRev = new Decimal(String(posRevenue._sum.total ?? 0));
    const onlineRev = new Decimal(String(onlineRevenue._sum.total ?? 0));

    return {
      today: {
        revenue: totalRevenue.toFixed(2),
        orders: todayOrders._count.id,
        posRevenue: posRev.toFixed(2),
        onlineRevenue: onlineRev.toFixed(2),
        posShare: totalRevenue.isZero()
          ? 0
          : posRev.dividedBy(totalRevenue).times(100).toDecimalPlaces(1).toNumber(),
        onlineShare: totalRevenue.isZero()
          ? 0
          : onlineRev.dividedBy(totalRevenue).times(100).toDecimalPlaces(1).toNumber(),
      },
      catalog: { totalProducts, lowStockCount },
      weeklyRevenue,
      topProducts,
    };
  }

  private async get7DayRevenueTrend(warehouseId?: string) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });

    return Promise.all(
      days.map(async (day) => {
        const start = new Date(day.setHours(0, 0, 0, 0));
        const end = new Date(day.setHours(23, 59, 59, 999));
        const result = await this.prisma.order.aggregate({
          where: {
            createdAt: { gte: start, lte: end },
            status: { not: 'CANCELLED' },
            ...(warehouseId ? { warehouseId } : {}),
          },
          _sum: { total: true },
          _count: { id: true },
        });
        return {
          date: start.toISOString().split('T')[0],
          revenue: Number(result._sum.total ?? 0),
          orders: result._count.id,
        };
      }),
    );
  }

  // ─── FINANCIAL ANALYTICS ─────────────────────────────────────

  async getFinancialReport(from: Date, to: Date) {
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
      },
      include: {
        items: {
          include: { variant: { select: { baseCost: true } } },
        },
      },
    });

    let grossRevenue = new Decimal(0);
    let totalCogs = new Decimal(0);
    let totalGst = new Decimal(0);
    let totalDiscount = new Decimal(0);
    const sourceBreakdown: Record<string, number> = {};

    for (const order of orders) {
      grossRevenue = grossRevenue.plus(String(order.total));
      totalGst = totalGst.plus(String(order.gstTax));

      // Order Source breakdown (replacing payment method as it's not in schema)
      sourceBreakdown[order.source] =
        (sourceBreakdown[order.source] ?? 0) + Number(order.total);

      // COGS
      for (const item of order.items) {
        totalCogs = totalCogs.plus(
          new Decimal(String(item.variant.baseCost)).times(item.quantityOrdered),
        );
      }
    }

    const netRevenue = grossRevenue.minus(totalGst);
    const grossProfit = netRevenue.minus(totalCogs);
    const aov = orders.length > 0 ? grossRevenue.dividedBy(orders.length) : new Decimal(0);

    return {
      period: { from, to },
      grossRevenue: grossRevenue.toFixed(2),
      netRevenue: netRevenue.toFixed(2),
      totalCogs: totalCogs.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      grossMarginPct: netRevenue.isZero()
        ? 0
        : grossProfit.dividedBy(netRevenue).times(100).toDecimalPlaces(2).toNumber(),
      totalGstCollected: totalGst.toFixed(2),
      totalDiscounts: totalDiscount.toFixed(2), // Omitted logically, but kept key for interface
      aov: aov.toFixed(2),
      orderCount: orders.length,
      sourceBreakdown,
    };
  }

  // ─── TOP PRODUCTS ────────────────────────────────────────────

  async getTopProducts(limit = 10) {
    // 1. Fetch valid order IDs first (Prisma groupBy cannot filter by relation)
    const validOrders = await this.prisma.order.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { id: true },
    });
    const validOrderIds = validOrders.map((o) => o.id);

    // 2. Group by variantId using only the valid orderIds
    const result = await this.prisma.orderItem.groupBy({
      by: ['variantId'],
      where: { orderId: { in: validOrderIds } },
      _sum: { quantityOrdered: true },
      orderBy: { _sum: { quantityOrdered: 'desc' } },
      take: limit,
    });

    return Promise.all(
      result.map(async (row) => {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: row.variantId },
          include: { product: { select: { name: true } } },
        });
        return {
          variantId: row.variantId,
          name: `${variant?.product.name} — ${variant?.sku}`,
          sku: variant?.sku,
          unitsSold: row._sum.quantityOrdered,
        };
      }),
    );
  }

  // ─── PRODUCT PROFIT MARGIN ───────────────────────────────────

  async getProductMargins(categoryId?: string) {
    const variants = await this.prisma.productVariant.findMany({
      where: {
        ...(categoryId ? { product: { categoryId } } : {}),
      },
      include: { product: { select: { name: true, categoryId: true } } },
      orderBy: { retailPrice: 'desc' },
    });

    return variants.map((v) => {
      const cost = new Decimal(String(v.baseCost));
      const price = new Decimal(String(v.retailPrice));
      const margin = price.minus(cost);
      const marginPct = price.isZero() ? new Decimal(0) : margin.dividedBy(price).times(100);

      return {
        variantId: v.id,
        sku: v.sku,
        name: `${v.product.name} — ${v.sku}`,
        baseCost: cost.toFixed(2),
        retailPrice: price.toFixed(2),
        margin: margin.toFixed(2),
        marginPct: marginPct.toDecimalPlaces(2).toNumber(),
      };
    });
  }

  // ─── DEMAND FORECASTING (30-day velocity) ────────────────────

  async getDemandForecast(limit = 20) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Sales velocity per variant in last 30 days
    const velocities = await this.prisma.orderItem.groupBy({
      by: ['variantId'],
      where: {
        order: {
          status: { not: 'CANCELLED' },
          createdAt: { gte: thirtyDaysAgo },
        },
      },
      _sum: { quantityOrdered: true },
      orderBy: { _sum: { quantityOrdered: 'desc' } },
      take: limit,
    });

    return Promise.all(
      velocities.map(async (row) => {
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: row.variantId },
          include: { product: { select: { name: true } } },
        });

        const stock = await this.prisma.inventoryStock.aggregate({
          where: { variantId: row.variantId },
          _sum: { quantityAvailable: true },
        });

        const dailyVelocity = (row._sum.quantityOrdered ?? 0) / 30;
        const currentStock = stock._sum.quantityAvailable ?? 0;
        const daysOfStock = dailyVelocity > 0 ? currentStock / dailyVelocity : Infinity;
        const projectedNeed = Math.ceil(dailyVelocity * 30);
        const restockNeeded = Math.max(0, projectedNeed - currentStock);

        return {
          variantId: row.variantId,
          sku: variant?.sku,
          name: `${variant?.product.name} — ${variant?.sku}`,
          unitsSold30d: row._sum.quantityOrdered,
          dailyVelocity: dailyVelocity.toFixed(2),
          currentStock,
          daysOfStock: isFinite(daysOfStock) ? daysOfStock.toFixed(1) : '∞',
          projectedNeed30d: projectedNeed,
          restockNeeded,
          urgency:
            daysOfStock < 7 ? 'CRITICAL' : daysOfStock < 14 ? 'HIGH' : daysOfStock < 30 ? 'MEDIUM' : 'OK',
        };
      }),
    );
  }

  // ─── SCRAP / LOSS REPORT ─────────────────────────────────────

  async getScrapReport(from: Date, to: Date) {
    const logs = await this.prisma.inventoryLedger.findMany({
      where: { 
        timestamp: { gte: from, lte: to },
        reasonCode: 'SCRAP_WRITEOFF'
      },
      include: {
        variant: { include: { product: { select: { name: true } } } },
        shelf: { include: { rack: { include: { zone: { include: { warehouse: { select: { name: true } } } } } } } },
      },
      orderBy: { timestamp: 'desc' },
    });

    let totalLoss = new Decimal(0);

    const entries = logs.map(log => {
      // Calculate loss value: Base Cost * absolute value of the scrapped quantity
      const offsetValue = new Decimal(String(log.variant.baseCost)).times(Math.abs(log.quantityDelta));
      totalLoss = totalLoss.plus(offsetValue);
      
      return {
        id: log.id,
        date: log.timestamp,
        variantSku: log.variant.sku,
        productName: log.variant.product.name,
        warehouseName: log.shelf.rack.zone.warehouse.name,
        quantityScrapped: Math.abs(log.quantityDelta),
        lossValue: offsetValue.toFixed(2),
        userId: log.userId
      };
    });

    return {
      period: { from, to },
      totalLoss: totalLoss.toFixed(2),
      entries,
    };
  }
}