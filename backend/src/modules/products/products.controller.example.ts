// src/modules/products/products.controller.ts
// ── Example showing @RequirePermissions in a downstream module ──
import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags }                            from '@nestjs/swagger';
import { RequirePermissions }                                from '@/modules/auth/decorators/index';

/**
 * PERMISSION CATALOGUE (document in a shared enum for type safety)
 *
 *  CREATE_PRODUCT:PRODUCT   — create new products/variants
 *  READ_PRODUCT:PRODUCT     — view product catalog
 *  UPDATE_PRODUCT:PRODUCT   — edit product details, pricing
 *  DELETE_PRODUCT:PRODUCT   — archive/soft-delete products
 *  MANAGE_INVENTORY:*       — wildcard: all inventory subjects
 *  READ_REPORT:*            — wildcard: all report subjects
 *  VOID_SALE:ORDER          — void a completed sales order
 *  PROCESS_REFUND:ORDER     — issue a refund
 *  MANAGE_STAFF:USER        — create/edit/deactivate staff accounts
 */

@ApiTags('Products')
@ApiBearerAuth('access-token')
@Controller('products')
export class ProductsController {

  // Only roles with CREATE_PRODUCT:PRODUCT (or CREATE_PRODUCT:*) can hit this
  @Post()
  @RequirePermissions('CREATE_PRODUCT:PRODUCT')
  create(@Body() dto: any) { /* … */ }

  // READ is typically granted to all authenticated staff
  @Get()
  @RequirePermissions('READ_PRODUCT:PRODUCT')
  findAll() { /* … */ }

  @Get(':id')
  @RequirePermissions({ action: 'READ_PRODUCT', subject: 'PRODUCT' })
  findOne(@Param('id') id: string) { /* … */ }

  // Multiple permissions — user must have ALL of them
  @Patch(':id')
  @RequirePermissions('UPDATE_PRODUCT:PRODUCT', 'READ_PRODUCT:PRODUCT')
  update(@Param('id') id: string, @Body() dto: any) { /* … */ }

  // SUPER_ADMIN only in practice — tightest permission
  @Delete(':id')
  @RequirePermissions('DELETE_PRODUCT:PRODUCT')
  remove(@Param('id') id: string) { /* … */ }
}
