import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import {
  AuthResponseDto,
  EnableMfaDto,
  LoginDto,
  MfaVerifyDto,
  RefreshTokenDto,
  SetupMfaResponseDto,
  UserProfileDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from '@/common/auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '@/common/auth/decorators/current-user.decorator';

@ApiTags('Authentication & Identity')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Administrative operator authentication' })
  @ApiResponse({ status: 200, description: 'Authentication successful', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials or account locked' })
  async login(
    @Body() dto: LoginDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const userAgent = req.get('user-agent');
    return this.authService.login(dto, ipAddress, userAgent);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify TOTP code or backup recovery code during MFA challenge' })
  @ApiResponse({
    status: 200,
    description: 'MFA verified and session issued',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired MFA code' })
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const userAgent = req.get('user-agent');
    return this.authService.verifyMfa(dto, ipAddress, userAgent);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange single-use refresh token for fresh access and refresh tokens',
  })
  @ApiResponse({ status: 200, description: 'Tokens successfully rotated', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token invalid, expired or revoked' })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const userAgent = req.get('user-agent');
    return this.authService.refreshToken(dto, ipAddress, userAgent);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Revoke active refresh token and terminate administrative session' })
  @ApiResponse({ status: 200, description: 'Session terminated' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    const userAgent = req.get('user-agent');
    return this.authService.logout(user.id, user.email, ipAddress, userAgent);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Retrieve currently authenticated operator profile and permissions' })
  @ApiResponse({ status: 200, description: 'User profile returned', type: UserProfileDto })
  async getProfile(@CurrentUser('id') userId: string): Promise<UserProfileDto> {
    return this.authService.getProfile(userId);
  }

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Generate TOTP secret and OTP Auth URI for setting up authenticator app',
  })
  @ApiResponse({
    status: 200,
    description: 'MFA setup secret generated',
    type: SetupMfaResponseDto,
  })
  async setupMfa(@CurrentUser('id') userId: string): Promise<SetupMfaResponseDto> {
    return this.authService.setupMfa(userId);
  }

  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Confirm and enable TOTP MFA using a 6-digit code, returning backup recovery codes',
  })
  @ApiResponse({ status: 200, description: 'MFA enabled and recovery codes generated' })
  async enableMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EnableMfaDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ): Promise<{ recoveryCodes: string[] }> {
    const userAgent = req.get('user-agent');
    return this.authService.enableMfa(user.id, dto.token, user.email, ipAddress, userAgent);
  }
}
