// src/modules/auth/dto/login.dto.ts
import { ApiProperty }               from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example     : 'manager@pos.io',
    description : 'Registered email address',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example     : 'StrongPass#2024',
    description : 'Account password (min 8 characters)',
    minLength   : 8,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

// ─── Response DTOs (used by Swagger + class-transformer) ─────

export class PermissionResponseDto {
  @ApiProperty({ example: 'CREATE_PRODUCT' }) action  : string;
  @ApiProperty({ example: 'PRODUCT'        }) subject : string;
}

export class RoleResponseDto {
  @ApiProperty({ example: 'clx1abc123'  }) id   : string;
  @ApiProperty({ example: 'MANAGER'     }) name : string;
  @ApiProperty({ type: [PermissionResponseDto] }) permissions: PermissionResponseDto[];
}

export class UserResponseDto {
  @ApiProperty({ example: 'clx1abc123'      }) id        : string;
  @ApiProperty({ example: 'manager@pos.io'  }) email     : string;
  @ApiProperty({ example: 'jdoe'            }) username  : string;
  @ApiProperty({ example: 'John'            }) firstName : string;
  @ApiProperty({ example: 'Doe'             }) lastName  : string;
  @ApiProperty({ example: true              }) isActive  : boolean;
  @ApiProperty({ example: true              }) isVerified: boolean;
  @ApiProperty({ example: '2024-01-15T08:30:00.000Z', nullable: true }) lastLoginAt: string | null;
  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' }) createdAt  : string;
  @ApiProperty({ type: [RoleResponseDto]    }) roles      : RoleResponseDto[];
}

export class LoginResponseDto {
  @ApiProperty({
    example     : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
    description : 'Short-lived JWT access token (15 min)',
  })
  accessToken: string;

  @ApiProperty({
    example     : 'dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4…',
    description : 'Long-lived refresh token (7 days) — store in httpOnly cookie',
  })
  refreshToken: string;

  @ApiProperty({ example: 900, description: 'Access token TTL in seconds' })
  expiresIn: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
