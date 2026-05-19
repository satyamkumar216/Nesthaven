// src/modules/auth/auth.module.ts
import { Module }         from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule }      from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD }      from '@nestjs/core';

import { PrismaModule }      from '@/prisma/prisma.module';
import { AuthController }    from './auth.controller';
import { AuthService }       from './auth.service';
import { JwtStrategy }       from './strategies/jwt.strategy';
import { JwtAuthGuard }      from './guards/jwt-auth.guard';
import { PermissionsGuard }  from './guards/permissions.guard';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports   : [ConfigModule],
      inject    : [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret     : config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m', issuer: 'pos-ims' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers  : [
    AuthService,
    JwtStrategy,

    // ── Global Guards (applied in order) ──────────────────
    // 1. JwtAuthGuard  — verifies the Bearer token on every route
    //                    (skipped for @Public() routes)
    {
      provide : APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // 2. PermissionsGuard — checks @RequirePermissions() metadata
    {
      provide : APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
