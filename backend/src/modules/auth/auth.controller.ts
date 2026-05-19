// src/modules/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBody,
} from '@nestjs/swagger';
import { Request } from 'express';

import { AuthService }                              from './auth.service';
import { LoginDto, LoginResponseDto, UserResponseDto } from './dto/auth.dto';
import { JwtAuthGuard }                             from './guards/jwt-auth.guard';
import { Public, CurrentUser }                      from './decorators/index';
import { ActiveUser }                               from './strategies/jwt.strategy';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ───────────────────────────────────────────────────────────
  // POST /auth/login
  // ───────────────────────────────────────────────────────────
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary     : 'Authenticate a user',
    description : `
Validates email + password credentials and returns:
- A short-lived **JWT access token** (15 min, send as \`Authorization: Bearer <token>\`)
- A long-lived **refresh token** (7 days, store in an httpOnly cookie in production)
- The authenticated **user object** with resolved roles and permissions
    `.trim(),
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status      : HttpStatus.OK,
    description : 'Credentials valid — tokens and user profile returned.',
    type        : LoginResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  async login(
    @Body()       dto : LoginDto,
    @Req()        req : Request,
  ): Promise<LoginResponseDto> {
    return this.authService.login(dto, {
      ip : req.ip,
      ua : req.headers['user-agent'],
    });
  }

  // ───────────────────────────────────────────────────────────
  // GET /auth/me
  // ───────────────────────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary     : 'Get current authenticated user',
    description  : 'Returns the full user profile (including roles and permissions) for the bearer of the access token.',
  })
  @ApiResponse({
    status      : HttpStatus.OK,
    description : 'Authenticated user profile.',
    type        : UserResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Access token is missing or expired.' })
  @ApiForbiddenResponse({ description: 'Account is inactive.' })
  async me(@CurrentUser() user: ActiveUser): Promise<UserResponseDto> {
    return this.authService.getMe(user);
  }
}
