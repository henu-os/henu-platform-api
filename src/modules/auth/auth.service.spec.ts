import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { UnauthorizedException } from '@nestjs/common';
import { CryptoUtil } from '@/common/auth/crypto.util';

describe('AuthService', () => {
  let service: AuthService;

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mock_jwt_token_xyz'),
    verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-123', isMfaPending: true }),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'auth.jwtSecret') return 'test_jwt_secret_12345';
      return null;
    }),
  };

  const mockAuditService = {
    recordLog: jest.fn().mockResolvedValue(undefined),
  };

  const mockPrisma = {
    adminUser: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should throw UnauthorizedException if user is not found', async () => {
      mockPrisma.adminUser.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.login({ email: 'unknown@henuos.com', password: 'password123' }, '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockAuditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_LOGIN_FAILED' }),
      );
    });

    it('should throw UnauthorizedException if account is locked', async () => {
      mockPrisma.adminUser.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'locked@henuos.com',
        isActive: true,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // locked for 10 min
      });

      await expect(
        service.login({ email: 'locked@henuos.com', password: 'password123' }, '127.0.0.1'),
      ).rejects.toThrow(/temporarily locked/);
    });

    it('should increment failed attempts and lock account on 5th failure', async () => {
      const passwordHash = await CryptoUtil.hashPassword('CorrectPassword123!');
      mockPrisma.adminUser.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'user@henuos.com',
        passwordHash,
        isActive: true,
        failedLoginAttempts: 4,
        lockedUntil: null,
      });

      mockPrisma.adminUser.update.mockResolvedValueOnce({});

      await expect(
        service.login({ email: 'user@henuos.com', password: 'WrongPassword!' }, '127.0.0.1'),
      ).rejects.toThrow(/temporarily locked due to 5 consecutive failed attempts/);

      expect(mockPrisma.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 5,
            lockedUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('should return session tokens when credentials are valid and MFA is not enabled', async () => {
      const passwordHash = await CryptoUtil.hashPassword('ValidPassword123!');
      mockPrisma.adminUser.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'admin@henuos.com',
        fullName: 'Admin User',
        passwordHash,
        isActive: true,
        mfaEnabled: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        role: {
          name: 'SUPER_ADMIN',
          permissions: [{ permission: { code: 'apps:create' } }],
        },
      });

      mockPrisma.adminUser.update.mockResolvedValueOnce({});

      const result = await service.login(
        { email: 'admin@henuos.com', password: 'ValidPassword123!' },
        '127.0.0.1',
      );

      expect(result.mfaRequired).toBe(false);
      expect(result.accessToken).toBe('mock_jwt_token_xyz');
      expect(result.refreshToken).toBeDefined();
      expect(result.user?.role).toBe('SUPER_ADMIN');
      expect(mockAuditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_LOGIN_SUCCESS' }),
      );
    });

    it('should return mfaRequired: true when MFA is enabled', async () => {
      const passwordHash = await CryptoUtil.hashPassword('ValidPassword123!');
      mockPrisma.adminUser.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'mfa@henuos.com',
        fullName: 'MFA User',
        passwordHash,
        isActive: true,
        mfaEnabled: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        role: { name: 'ADMINISTRATOR', permissions: [] },
      });

      const result = await service.login(
        { email: 'mfa@henuos.com', password: 'ValidPassword123!' },
        '127.0.0.1',
      );

      expect(result.mfaRequired).toBe(true);
      expect(result.tempToken).toBe('mock_jwt_token_xyz');
    });
  });

  describe('refreshToken', () => {
    it('should rotate refresh token and return fresh tokens', async () => {
      const rawRefreshToken = 'initial_refresh_token_string_123';
      const hashed = CryptoUtil.hashToken(rawRefreshToken);

      mockPrisma.adminUser.findFirst.mockResolvedValueOnce({
        id: 'u1',
        email: 'admin@henuos.com',
        fullName: 'Admin User',
        isActive: true,
        mfaEnabled: false,
        refreshTokenHash: hashed,
        role: { name: 'SUPER_ADMIN', permissions: [] },
      });
      mockPrisma.adminUser.update.mockResolvedValueOnce({});

      const result = await service.refreshToken({ refreshToken: rawRefreshToken }, '127.0.0.1');

      expect(result.accessToken).toBe('mock_jwt_token_xyz');
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(rawRefreshToken); // Rotated!
      expect(mockPrisma.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            refreshTokenHash: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('logout', () => {
    it('should clear refresh token hash in database', async () => {
      mockPrisma.adminUser.update.mockResolvedValueOnce({});

      const result = await service.logout('u1', 'admin@henuos.com', '127.0.0.1');
      expect(result.success).toBe(true);
      expect(mockPrisma.adminUser.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { refreshTokenHash: null },
      });
    });
  });
});
