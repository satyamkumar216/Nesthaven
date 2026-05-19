// src/modules/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService }    from '@nestjs/jwt';
import * as bcrypt       from 'bcrypt';
import * as crypto       from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { LoginDto, LoginResponseDto, UserResponseDto } from './dto/auth.dto';
import { JwtPayload, ActiveUser }                       from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly ACCESS_TTL_SEC  = 15 * 60;        // 15 minutes
  private readonly REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

  constructor(
    private readonly prisma  : PrismaService,
    private readonly jwt     : JwtService,
    private readonly config  : ConfigService,
  ) {}

  // ─── Login ────────────────────────────────────────────────
  async login(dto: LoginDto, meta: { ip?: string; ua?: string } = {}): Promise<LoginResponseDto> {
    // 1. Find user with full role/permission tree
    const user = await this.prisma.user.findUnique({
      where  : { email: dto.email, deletedAt: null },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    // 2. Verify password
    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    // 3. Flatten roles & permissions for JWT payload
    const roles       = user.roles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(
        user.roles.flatMap((ur) =>
          ur.role.permissions.map(
            (rp) => `${rp.permission.action}:${rp.permission.subject}`,
          ),
        ),
      ),
    ];

    // 4. Issue tokens
    const payload: JwtPayload = {
      sub      : user.id,
      email    : user.email,
      username : user.username,
      roles,
      permissions,
    };

    const [accessToken, rawRefresh] = await Promise.all([
      this.jwt.signAsync(payload, { expiresIn: this.ACCESS_TTL_SEC }),
      this.generateRefreshToken(),
    ]);

    // 5. Persist hashed refresh token
    const refreshHash    = crypto.createHash('sha256').update(rawRefresh).digest('hex');
    const refreshExpires = new Date(Date.now() + this.REFRESH_TTL_SEC * 1000);

    await Promise.all([
      this.prisma.refreshToken.create({
        data: {
          token     : refreshHash,
          userId    : user.id,
          expiresAt : refreshExpires,
          userAgent : meta.ua,
          ipAddress : meta.ip,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data : { lastLoginAt: new Date() },
      }),
    ]);

    return {
      accessToken,
      refreshToken : rawRefresh,
      expiresIn    : this.ACCESS_TTL_SEC,
      tokenType    : 'Bearer',
      user         : this.toUserDto(user, roles, user.roles.map((ur) => ur.role)),
    };
  }

  // ─── Get current user (for /me) ───────────────────────────
  async getMe(activeUser: ActiveUser): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where  : { id: activeUser.id, deletedAt: null },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    const roles = user.roles.map((ur) => ur.role);
    return this.toUserDto(user, roles.map((r) => r.name), roles);
  }

  // ─── Helpers ──────────────────────────────────────────────
  private async generateRefreshToken(): Promise<string> {
    return crypto.randomBytes(64).toString('hex');
  }

  private toUserDto(user: any, roleNames: string[], roles: any[]): UserResponseDto {
    return {
      id         : user.id,
      email      : user.email,
      username   : user.username,
      firstName  : user.firstName,
      lastName   : user.lastName,
      isActive   : user.isActive,
      isVerified : user.isVerified,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt  : user.createdAt.toISOString(),
      roles      : roles.map((role) => ({
        id          : role.id,
        name        : role.name,
        permissions : (role.permissions ?? []).map((rp: any) => ({
          action : rp.permission?.action ?? rp.action,
          subject: rp.permission?.subject ?? rp.subject,
        })),
      })),
    };
  }
}
