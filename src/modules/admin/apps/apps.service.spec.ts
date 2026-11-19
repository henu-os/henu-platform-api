import { Test, TestingModule } from '@nestjs/testing';
import { AppsManagementService } from './apps.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { ConflictException } from '@nestjs/common';
import {
  ApplicationStatusEnum,
  ApplicationTypeEnum,
  OperatingSystemEnum,
  CpuArchitectureEnum,
  PackageFormatEnum,
} from './dto/app-management.dto';

describe('AppsManagementService', () => {
  let service: AppsManagementService;

  const mockAuditService = {
    recordLog: jest.fn().mockResolvedValue(undefined),
  };

  const mockPrisma = {
    application: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    platformCompatibility: {
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppsManagementService,
        { provide: AuditService, useValue: mockAuditService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AppsManagementService>(AppsManagementService);
    jest.clearAllMocks();
  });

  describe('registerApplication', () => {
    it('should throw ConflictException if slug already exists', async () => {
      mockPrisma.application.findUnique.mockResolvedValueOnce({ id: 'app-1', slug: 'henu-pa' });

      await expect(
        service.registerApplication({
          slug: 'henu-pa',
          displayName: 'HENU PA',
          summary: 'Personal Assistant',
          description: 'Productivity tool',
          category: 'PRODUCTIVITY',
          iconUrl: 'https://example.com/icon.svg',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create application and record audit log', async () => {
      mockPrisma.application.findUnique.mockResolvedValueOnce(null);
      mockPrisma.application.create.mockResolvedValueOnce({
        id: 'app-uuid',
        slug: 'henu-ai',
        displayName: 'HENU AI',
      });

      const result = await service.registerApplication(
        {
          slug: 'henu-ai',
          displayName: 'HENU AI',
          summary: 'AI Engine',
          description: 'AI platform tooling',
          category: 'AI',
          iconUrl: 'https://example.com/ai.svg',
          appType: ApplicationTypeEnum.DESKTOP,
          minHubVersion: '1.0.0',
        },
        { id: 'admin-1', email: 'admin@henuos.com', role: 'SUPER_ADMIN', permissions: [] },
      );

      expect(result.slug).toBe('henu-ai');
      expect(mockAuditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPLICATION_REGISTERED',
          entityType: 'Application',
          entityId: 'app-uuid',
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should change status and audit action', async () => {
      mockPrisma.application.findFirst.mockResolvedValueOnce({
        id: 'app-1',
        status: 'DRAFT',
      });
      mockPrisma.application.update.mockResolvedValueOnce({
        id: 'app-1',
        status: 'ACTIVE',
      });

      const updated = await service.updateStatus('app-1', ApplicationStatusEnum.ACTIVE, {
        id: 'admin-1',
        email: 'admin@henuos.com',
        role: 'SUPER_ADMIN',
        permissions: [],
      });

      expect(updated.status).toBe('ACTIVE');
      expect(mockAuditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPLICATION_STATUS_CHANGED',
        }),
      );
    });
  });

  describe('archiveApplication', () => {
    it('should set status to ARCHIVED and mark deletedAt', async () => {
      mockPrisma.application.findFirst.mockResolvedValueOnce({
        id: 'app-1',
        slug: 'henu-pa',
      });
      mockPrisma.application.update.mockResolvedValueOnce({
        id: 'app-1',
        status: 'ARCHIVED',
        deletedAt: new Date(),
      });

      const archived = await service.archiveApplication('app-1');
      expect(archived.status).toBe('ARCHIVED');
      expect(mockAuditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'APPLICATION_ARCHIVED' }),
      );
    });
  });

  describe('platformCompatibility', () => {
    it('should configure compatibility rule', async () => {
      mockPrisma.application.findFirst.mockResolvedValueOnce({ id: 'app-1' });
      mockPrisma.platformCompatibility.upsert.mockResolvedValueOnce({
        id: 'compat-1',
        os: 'WINDOWS',
        arch: 'X86_64',
        packageFormat: 'EXE',
      });

      const compat = await service.addPlatformCompatibility('app-1', {
        os: OperatingSystemEnum.WINDOWS,
        arch: CpuArchitectureEnum.X86_64,
        packageFormat: PackageFormatEnum.EXE,
        minOsVersion: 'Windows 10 21H2',
      });

      expect(compat.id).toBe('compat-1');
      expect(mockAuditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PLATFORM_COMPATIBILITY_CONFIGURED' }),
      );
    });
  });
});
