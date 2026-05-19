import { Injectable, NotFoundException, ConflictException, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── CREATE STAFF ────────────────────────────────────────────
  async create(data: {
    name: string;
    email: string;
    pin: string;
    role?: StaffRole;
    warehouseId: string;
  }) {
    const existing = await this.prisma.staff.findUnique({
      where: { email: data.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const hashedPin = await bcrypt.hash(data.pin, 10);

    return this.prisma.staff.create({
      data: {
        name:        data.name,
        email:       data.email,
        pin:         hashedPin,
        role:        data.role ?? StaffRole.CASHIER,
        warehouseId: data.warehouseId,
      },
      select: {
        id: true, name: true, email: true,
        role: true, warehouseId: true,
        isActive: true, createdAt: true,
      },
    });
  }

  // ── VALIDATE PIN FOR AUTH ───────────────────────────────────
  async validatePin(email: string, pin: string) {
    const staff = await this.prisma.staff.findUnique({ where: { email } });
    if (!staff || !staff.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(pin, staff.pin);
    if (!valid) throw new UnauthorizedException('Invalid PIN');

    return {
      id:          staff.id,
      name:        staff.name,
      email:       staff.email,
      role:        staff.role,
      warehouseId: staff.warehouseId,
    };
  }

  // ── LIST WAREHOUSE STAFF ─────────────────────────────────────
  async findByWarehouse(warehouseId: string) {
    return this.prisma.staff.findMany({
      where: { warehouseId, isActive: true },
      select: {
        id: true, name: true, email: true,
        role: true, isActive: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── DEACTIVATE STAFF ─────────────────────────────────────────
  async deactivate(id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException('Staff member not found');

    return this.prisma.staff.update({
      where: { id },
      data:  { isActive: false },
      select: { id: true, name: true, isActive: true },
    });
  }

  // ── UPDATE PIN ───────────────────────────────────────────────
  async changePin(id: string, oldPin: string, newPin: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException('Staff not found');

    const valid = await bcrypt.compare(oldPin, staff.pin);
    if (!valid) throw new UnauthorizedException('Current PIN is incorrect');

    const hashedPin = await bcrypt.hash(newPin, 10);
    await this.prisma.staff.update({
      where: { id },
      data:  { pin: hashedPin },
    });

    return { success: true, message: 'PIN updated' };
  }
}