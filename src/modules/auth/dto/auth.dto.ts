import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@henuos.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'SuperSecurePassword123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}

export class MfaVerifyDto {
  @ApiProperty({ description: 'Short-lived MFA temporary verification token' })
  @IsString()
  @IsNotEmpty()
  tempToken: string;

  @ApiProperty({ description: '6-digit TOTP code or 8-char recovery code', example: '123456' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Rotating refresh token string' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class SetupMfaResponseDto {
  @ApiProperty()
  secret: string;

  @ApiProperty()
  otpAuthUrl: string;
}

export class EnableMfaDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class UserProfileDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  role: string;

  @ApiProperty({ type: [String] })
  permissions: string[];

  @ApiProperty()
  mfaEnabled: boolean;
}

export class AuthResponseDto {
  @ApiProperty({ example: false })
  mfaRequired: boolean;

  @ApiPropertyOptional()
  tempToken?: string;

  @ApiPropertyOptional()
  accessToken?: string;

  @ApiPropertyOptional()
  refreshToken?: string;

  @ApiPropertyOptional({ example: '15m' })
  expiresIn?: string;

  @ApiPropertyOptional({ type: UserProfileDto })
  user?: UserProfileDto;
}
