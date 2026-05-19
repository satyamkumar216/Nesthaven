// src/modules/auth/guards/jwt-auth.guard.ts
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector }       from '@nestjs/core';
import { AuthGuard }       from '@nestjs/passport';
import { Observable }      from 'rxjs';
import { IS_PUBLIC_KEY }   from '../decorators/index';

/**
 * JwtAuthGuard
 *
 * Applied globally via APP_GUARD. Routes decorated with @Public() bypass JWT
 * validation entirely. All other routes require a valid Bearer token.
 *
 * Usage:
 *   @Public()                   // no token required
 *   @Post('login')
 *
 *   @Get('me')                  // token required (default)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    ctx: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Allow routes explicitly marked @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(ctx);
  }

  // Override to customise the 401 message
  handleRequest<TUser = any>(
    err   : Error | null,
    user  : TUser | false,
    info  : { message?: string } | undefined,
  ): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException(
        info?.message ?? 'Access token is missing or invalid.',
      );
    }
    return user;
  }
}
