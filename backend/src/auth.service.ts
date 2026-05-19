import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(pin: string, warehouseId: string) {
    // Simple PIN-based auth for POS cashiers
    const validPin = process.env.POS_PIN ?? '1234';
    if (pin !== validPin) throw new UnauthorizedException('Invalid PIN');

    const payload = {
      sub: 'cashier-001',
      warehouseId,
      role: 'CASHIER',
    };

    return {
      accessToken: this.jwt.sign(payload),
      expiresIn: '8h',
      warehouseId,
    };
  }

  async verifyToken(token: string) {
    try {
      return this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}