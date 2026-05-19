// src/modules/auth/decorators/require-permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

export interface RequiredPermission {
  action  : string;
  subject : string;
}

/**
 * @RequirePermissions(...permissions)
 *
 * Declarative RBAC decorator. Accepts one or more permission tuples.
 * PermissionsGuard enforces these after JWT validation.
 *
 * @example
 *   // Single permission
 *   @RequirePermissions({ action: 'CREATE_PRODUCT', subject: 'PRODUCT' })
 *
 *   // Shorthand strings — 'ACTION:SUBJECT'
 *   @RequirePermissions('CREATE_PRODUCT:PRODUCT', 'UPDATE_PRODUCT:PRODUCT')
 *
 *   // Wildcard subject
 *   @RequirePermissions('VIEW_REPORT:*')
 */
export const RequirePermissions = (
  ...permissions: (RequiredPermission | string)[]
) => {
  const normalised: RequiredPermission[] = permissions.map((p) => {
    if (typeof p === 'string') {
      const [action, subject = '*'] = p.split(':');
      return { action, subject };
    }
    return p;
  });

  return SetMetadata(PERMISSIONS_KEY, normalised);
};

// ─────────────────────────────────────────────────────────────
// src/modules/auth/decorators/public.decorator.ts
// ─────────────────────────────────────────────────────────────
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public()
 *
 * Marks a route as publicly accessible — JwtAuthGuard skips token validation.
 *
 * @example
 *   @Public()
 *   @Post('login')
 *   login(@Body() dto: LoginDto) { … }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// ─────────────────────────────────────────────────────────────
// src/modules/auth/decorators/current-user.decorator.ts
// ─────────────────────────────────────────────────────────────
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActiveUser } from '../strategies/jwt.strategy';

/**
 * @CurrentUser()
 *
 * Parameter decorator that extracts the validated user from the request.
 *
 * @example
 *   @Get('me')
 *   getMe(@CurrentUser() user: ActiveUser) { … }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActiveUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
