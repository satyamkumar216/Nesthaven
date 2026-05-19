import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { StaffService } from './staff.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { StaffRole } from '@prisma/client';

@Controller({ path: 'staff', version: '1' })
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() body: {
    name: string;
    email: string;
    pin: string;
    role?: StaffRole;
    warehouseId: string;
  }) {
    return this.staffService.create(body);
  }

  @Get('warehouse/:warehouseId')
  @UseGuards(JwtAuthGuard)
  listByWarehouse(@Param('warehouseId') warehouseId: string) {
    return this.staffService.findByWarehouse(warehouseId);
  }

  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard)
  deactivate(@Param('id') id: string) {
    return this.staffService.deactivate(id);
  }

  @Patch(':id/change-pin')
  @UseGuards(JwtAuthGuard)
  changePin(
    @Param('id') id: string,
    @Body() body: { oldPin: string; newPin: string },
  ) {
    return this.staffService.changePin(id, body.oldPin, body.newPin);
  }
}