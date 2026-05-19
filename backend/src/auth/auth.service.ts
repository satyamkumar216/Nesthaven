import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { StaffService } from '../staff/staff.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly staffService: StaffService,
  ) {}

  async login(email: string, pin: string) {
    // Validates credentials against hashed database records
    const staff = await this.staffService.validatePin(email, pin);

    const payload = {
      sub:         staff.id,
      name:        staff.name,
      role:        staff.role,
      warehouseId: staff.warehouseId,
    };

    return {
      accessToken: this.jwt.sign(payload),
      expiresIn:   '8h',
      staff: {
        id:          staff.id,
        name:        staff.name,
        role:        staff.role,
        warehouseId: staff.warehouseId,
      },
    };
  }
}