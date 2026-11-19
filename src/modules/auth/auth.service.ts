import { Injectable, UnauthorizedException, BadRequestException, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CryptoUtil } from '@/common/auth/crypto.util';
import {
  LoginDto,
  MfaVerifyDto,
  RefreshTokenDto,
  AuthResponseDto,
  SetupMfaResponseDto,
  UserProfileDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async login(dto: LoginDto, ipAddress: string, userAgent?: string): Promise<AuthResponseDto> {
    if (!this.prisma) {
      throw new UnauthorizedException('Database unavailable.');
    }

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.adminUser.findFirst({
      where: { email, deletedAt: null },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      await this.auditService.recordLog({
        actorEmail: email,
        ipAddress,
        userAgent,
        action: 'ADMIN_LOGIN_FAILED',
        entityType: 'AdminUser',
        entityId: 'unknown',
        payload: { reason: 'User not found or inactive', email },
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Check Account Lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const waitMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / (60 * 1000));
      throw new UnauthorizedException(
        `Account temporarily locked due to multiple failed login attempts. Please retry in ${waitMinutes} minutes.`,
      );
    }

    // Verify password with Argon2id
    const isPasswordValid = await CryptoUtil.verifyPassword(user.passwordHash, dto.password);

    if (!isPasswordValid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      const isLocking = failedAttempts >= 5;
      const lockedUntil = isLocking ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await this.prisma.adminUser.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failedAttempts,
          lockedUntil,
        },
      });

      await this.auditService.recordLog({
        adminUserId: user.id,
        actorEmail: user.email,
        ipAddress,
        userAgent,
        action: isLocking ? 'ADMIN_ACCOUNT_LOCKED' : 'ADMIN_LOGIN_FAILED',
        entityType: 'AdminUser',
        entityId: user.id,
        payload: { failedAttempts, isLocking },
      });

      if (isLocking) {
        throw new UnauthorizedException(
          'Account temporarily locked due to 5 consecutive failed attempts. Try again in 15 minutes.',
        );
      }

      throw new UnauthorizedException('Invalid email or password.');
    }

    // Reset failed login attempts on valid password
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.adminUser.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    // If TOTP MFA is enabled on account, issue temporary token
    if (user.mfaEnabled) {
      const tempToken = await this.jwtService.signAsync(
        {
          sub: user.id,
          email: user.email,
          isMfaPending: true,
        },
        {
          expiresIn: 300, // 5 minutes in seconds
          secret: this.configService.get<string>('auth.jwtSecret'),
        },
      );

      return {
        mfaRequired: true,
        tempToken,
      };
    }

    // Issue full session tokens
    return this.createSession(user, ipAddress, userAgent);
  }

  async verifyMfa(
    dto: MfaVerifyDto,
    ipAddress: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    if (!this.prisma) {
      throw new UnauthorizedException('Database unavailable.');
    }

    let payload: { sub: string; email: string; isMfaPending: boolean };
    try {
      payload = await this.jwtService.verifyAsync(dto.tempToken, {
        secret: this.configService.get<string>('auth.jwtSecret'),
      });
    } catch {
      throw new UnauthorizedException('MFA verification token has expired or is invalid.');
    }

    if (!payload.isMfaPending) {
      throw new UnauthorizedException('Invalid token type for MFA verification.');
    }

    const user = await this.prisma.adminUser.findFirst({
      where: { id: payload.sub, deletedAt: null },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user || !user.isActive || !user.mfaSecret) {
      throw new UnauthorizedException('User account or MFA configuration invalid.');
    }

    const trimmedCode = dto.code.trim();
    let isTotpValid = CryptoUtil.verifyMfaToken(trimmedCode, user.mfaSecret);
    let usedRecoveryCode = false;

    // Check backup recovery code if TOTP didn't match
    if (!isTotpValid && user.mfaRecoveryCodes && user.mfaRecoveryCodes.length > 0) {
      const hashedAttempt = CryptoUtil.hashToken(trimmedCode.toUpperCase());
      const codeIndex = user.mfaRecoveryCodes.indexOf(hashedAttempt);

      if (codeIndex !== -1) {
        isTotpValid = true;
        usedRecoveryCode = true;

        // Invalidate the used recovery code (single use!)
        const updatedCodes = [...user.mfaRecoveryCodes];
        updatedCodes.splice(codeIndex, 1);

        await this.prisma.adminUser.update({
          where: { id: user.id },
          data: { mfaRecoveryCodes: updatedCodes },
        });
      }
    }

    if (!isTotpValid) {
      await this.auditService.recordLog({
        adminUserId: user.id,
        actorEmail: user.email,
        ipAddress,
        userAgent,
        action: 'ADMIN_MFA_FAILED',
        entityType: 'AdminUser',
        entityId: user.id,
        payload: { attempt: '[REDACTED]' },
      });
      throw new UnauthorizedException('Invalid multi-factor authentication code.');
    }

    await this.auditService.recordLog({
      adminUserId: user.id,
      actorEmail: user.email,
      ipAddress,
      userAgent,
      action: usedRecoveryCode ? 'ADMIN_MFA_RECOVERY_USED' : 'ADMIN_MFA_SUCCESS',
      entityType: 'AdminUser',
      entityId: user.id,
      payload: { usedRecoveryCode },
    });

    return this.createSession(user, ipAddress, userAgent);
  }

  async refreshToken(
    dto: RefreshTokenDto,
    ipAddress: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    if (!this.prisma) {
      throw new UnauthorizedException('Database unavailable.');
    }

    const hashedToken = CryptoUtil.hashToken(dto.refreshToken);

    const user = await this.prisma.adminUser.findFirst({
      where: {
        refreshTokenHash: hashedToken,
        isActive: true,
        deletedAt: null,
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Refresh token is invalid, expired, or has been revoked.');
    }

    // Single-use token rotation: Issue new access token AND new refresh token
    const newSession = await this.createSession(user, ipAddress, userAgent, 'ADMIN_TOKEN_ROTATED');
    return newSession;
  }

  async logout(
    userId: string,
    actorEmail: string,
    ipAddress: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    if (this.prisma) {
      await this.prisma.adminUser.update({
        where: { id: userId },
        data: { refreshTokenHash: null },
      });

      await this.auditService.recordLog({
        adminUserId: userId,
        actorEmail,
        ipAddress,
        userAgent,
        action: 'ADMIN_LOGOUT',
        entityType: 'AdminUser',
        entityId: userId,
        payload: { status: 'session_terminated' },
      });
    }

    return {
      success: true,
      message: 'Session successfully terminated.',
    };
  }

  async setupMfa(userId: string): Promise<SetupMfaResponseDto> {
    if (!this.prisma) {
      throw new BadRequestException('Database unavailable.');
    }

    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found.');
    }

    const secret = CryptoUtil.generateMfaSecret();
    const otpAuthUrl = CryptoUtil.generateMfaKeyUri(user.email, secret);

    // Temporarily save secret until verified
    await this.prisma.adminUser.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    return { secret, otpAuthUrl };
  }

  async enableMfa(
    userId: string,
    token: string,
    actorEmail: string,
    ipAddress: string,
    userAgent?: string,
  ): Promise<{ recoveryCodes: string[] }> {
    if (!this.prisma) {
      throw new BadRequestException('Database unavailable.');
    }

    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
    });

    if (!user || !user.mfaSecret) {
      throw new BadRequestException('MFA setup not initialized for this user.');
    }

    const isValid = CryptoUtil.verifyMfaToken(token, user.mfaSecret);
    if (!isValid) {
      throw new BadRequestException('Invalid verification code. Could not enable MFA.');
    }

    const { rawCodes, hashedCodes } = CryptoUtil.generateRecoveryCodes(8);

    await this.prisma.adminUser.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaRecoveryCodes: hashedCodes,
      },
    });

    await this.auditService.recordLog({
      adminUserId: userId,
      actorEmail,
      ipAddress,
      userAgent,
      action: 'ADMIN_MFA_ENABLED',
      entityType: 'AdminUser',
      entityId: userId,
      payload: { mfaEnabled: true, recoveryCodeCount: rawCodes.length },
    });

    return { recoveryCodes: rawCodes };
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    if (!this.prisma) {
      throw new UnauthorizedException('Database unavailable.');
    }

    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive.');
    }

    const permissions = user.role.permissions.map((p) => p.permission.code);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      permissions,
      mfaEnabled: user.mfaEnabled,
    };
  }

  private async createSession(
    user: {
      id: string;
      email: string;
      fullName: string;
      mfaEnabled: boolean;
      role: {
        name: string;
        permissions: Array<{ permission: { code: string } }>;
      };
    },
    ipAddress: string,
    userAgent?: string,
    auditAction: string = 'ADMIN_LOGIN_SUCCESS',
  ): Promise<AuthResponseDto> {
    const permissions = user.role.permissions.map((p) => p.permission.code);
    const jwtSecret = this.configService.get<string>('auth.jwtSecret');

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role.name,
        permissions,
      },
      {
        expiresIn: 900, // 15 minutes in seconds
        secret: jwtSecret,
      },
    );

    const rawRefreshToken = CryptoUtil.generateRandomToken(32);
    const hashedRefreshToken = CryptoUtil.hashToken(rawRefreshToken);

    if (this.prisma) {
      await this.prisma.adminUser.update({
        where: { id: user.id },
        data: {
          refreshTokenHash: hashedRefreshToken,
          lastLoginAt: new Date(),
        },
      });

      await this.auditService.recordLog({
        adminUserId: user.id,
        actorEmail: user.email,
        ipAddress,
        userAgent,
        action: auditAction,
        entityType: 'AdminUser',
        entityId: user.id,
        payload: { role: user.role.name },
      });
    }

    return {
      mfaRequired: false,
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: '15m',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role.name,
        permissions,
        mfaEnabled: user.mfaEnabled,
      },
    };
  }
}
