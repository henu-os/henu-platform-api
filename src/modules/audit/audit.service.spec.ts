import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;

  const mockPrisma = {
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([{ id: 'log-1', action: 'TEST_ACTION' }]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<AuditService>(AuditService);
    jest.clearAllMocks();
  });

  describe('recordLog', () => {
    it('should sanitize sensitive keys from payload before writing to database', async () => {
      await service.recordLog({
        adminUserId: 'user-1',
        actorEmail: 'admin@henuos.com',
        ipAddress: '127.0.0.1',
        action: 'USER_PASSWORD_CHANGE',
        entityType: 'AdminUser',
        entityId: 'user-1',
        payload: {
          password: 'SecretPassword123',
          passwordHash: 'argon2id$12345',
          refreshToken: 'token_string',
          safeField: 'KeepMe',
        },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorEmail: 'admin@henuos.com',
          payload: {
            password: '[REDACTED]',
            passwordHash: '[REDACTED]',
            refreshToken: '[REDACTED]',
            safeField: 'KeepMe',
          },
        }),
      });
    });
  });

  describe('queryLogs', () => {
    it('should return paginated logs and metadata', async () => {
      const result = await service.queryLogs({ page: 1, limit: 10, entityType: 'Application' });
      expect(result.data.length).toBe(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Application' },
          skip: 0,
          take: 10,
        }),
      );
    });
  });
});
