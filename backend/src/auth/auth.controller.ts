import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: { pin: string; warehouseId: string }) {
    return this.authService.login(body.pin, body.warehouseId);
  }
}