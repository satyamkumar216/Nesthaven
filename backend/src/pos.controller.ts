// backend/src/pos.controller.ts

import { Controller, Post, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { PosService } from './pos.service';
import { BarcodeService } from './barcode.service';
import { InventoryService } from './inventory.service';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from './prisma.service';
import { CustomerService } from './customer.service';

@Controller({ path: 'pos', version: '1' })
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('checkout')
  checkout(@Body() body: any) {
    return this.posService.processCheckout(body);
  }
}

@Controller({ path: 'barcode', version: '1' })
export class BarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  @Get('scan')
  scan(@Query('code') code: string) {
    return this.barcodeService.processScan(code);
  }
}

@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('variant/:variantId')
  getStock(@Param('variantId') variantId: string) {
    return this.inventoryService.getStockByVariant(variantId);
  }

  @Get('low-stock')
  getLowStock(@Query('warehouseId') warehouseId?: string) {
    return this.inventoryService.getLowStockItems(warehouseId);
  }

  @Get('ledger/:variantId')
  getLedger(
    @Param('variantId') variantId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.inventoryService.getLedgerHistory(variantId, { skip, take });
  }
}

@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  dashboard(@Query('warehouseId') warehouseId?: string) {
    return this.analyticsService.getDashboardSummary(warehouseId);
  }

  @Get('top-products')
  topProducts(@Query('limit') limit = 10) {
    return this.analyticsService.getTopProducts(Number(limit));
  }

  @Get('margins')
  margins(@Query('categoryId') categoryId?: string) {
    return this.analyticsService.getProductMargins(categoryId);
  }

  @Get('forecast')
  forecast(@Query('limit') limit = 20) {
    return this.analyticsService.getDemandForecast(Number(limit));
  }

  @Get('financial')
  financial(@Query('from') from: string, @Query('to') to: string) {
    return this.analyticsService.getFinancialReport(new Date(from), new Date(to));
  }
}

@Controller({ path: 'customers', version: '1' })
export class CustomerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
  ) {}

  @Get('phone/:phone')
  findByPhone(@Param('phone') phone: string) {
    return this.customerService.findByPhone(phone);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.customerService.findById(id);
  }

  @Post()
  create(@Body() body: { name: string; phone: string; email?: string }) {
    return this.customerService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; email?: string },
  ) {
    return this.customerService.update(id, body);
  }

  @Get(':id/loyalty')
  loyalty(@Param('id') id: string) {
    return this.customerService.getLoyaltySummary(id);
  }
}