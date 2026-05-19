// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService }                      from '@nestjs/config';
import { PassportStrategy }                   from '@nestjs/passport';
import { InjectRepository }                   from '@nestjs/typeorm';
import { ExtractJwt, Strategy }               from 'passport-jwt';
import { PrismaService }                      from '@/prisma/prisma.service';

// ─── Token Payload (what we SIGN into the JWT) ────────────────
export interface JwtPayload {
  sub         : string;   // userId  (cuid)
  email       : string;
  username    : string;
  roles       : string[]; // role names  e.g. ['MANAGER', 'CASHIER']
  permissions : string[]; // flattened   e.g. ['CREATE_PRODUCT:PRODUCT']
  iat?        : number;
  exp?        : number;
}

// ─── Validated User (attached to request.user) ────────────────
export interface ActiveUser {
  id          : string;
  email       : string;
  username    : string;
  firstName   : string;
  lastName    : string;
  roles       : string[];
  permissions : string[]; // 'ACTION:SUBJECT' tuples
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config  : ConfigService,
    private readonly prisma  : PrismaService,
  ) {
    super({
      jwtFromRequest   : ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration : false,
      secretOrKey      : config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Called AFTER passport-jwt has verified the signature & expiry.
  async validate(payload: JwtPayload): Promise<ActiveUser> {
    const user = await this.prisma.user.findUnique({
      where  : { id: payload.sub, isActive: true, deletedAt: null },
      select : { id: true, email: true, username: true, firstName: true, lastName: true },
    });

    if (!user) throw new UnauthorizedException('User account is inactive or not found.');

    return {
      ...user,
      roles       : payload.roles,
      permissions : payload.permissions,
    };
  }
}
