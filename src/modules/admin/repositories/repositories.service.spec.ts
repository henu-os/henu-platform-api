import { Test, TestingModule } from '@nestjs/testing';
import { RepositoriesManagementService } from './repositories.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('RepositoriesManagementService', () => {
  let service: RepositoriesManagementService;

  const mockAuditService = {
    recordLog: jest.fn().mockResolvedValue(undefined),
  };

  const mockPrisma = {
    application: {
      findFirst: jest.fn(),
    },
    repositoryConnection: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepositoriesManagementService,
        { provide: AuditService, useValue: mockAuditService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RepositoriesManagementService>(RepositoriesManagementService);
    jest.clearAllMocks();
  });

  describe('createConnection', () => {
    it('should throw NotFoundException if application does not exist', async () => {
      mockPrisma.application.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createConnection({
          applicationId: 'app-missing',
          repoOwner: 'henu-os',
          repoName: 'henu-pa',
          githubInstallationId: 12345,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if repository is already connected', async () => {
      mockPrisma.application.findFirst.mockResolvedValueOnce({ id: 'app-1' });
      mockPrisma.repositoryConnection.findUnique.mockResolvedValueOnce({
        id: 'conn-1',
        applicationId: 'other-app',
      });

      await expect(
        service.createConnection({
          applicationId: 'app-1',
          repoOwner: 'henu-os',
          repoName: 'henu-pa',
          githubInstallationId: 12345,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create connection and record audit log', async () => {
      mockPrisma.application.findFirst.mockResolvedValueOnce({ id: 'app-1' });
      mockPrisma.repositoryConnection.findUnique.mockResolvedValueOnce(null);
      mockPrisma.repositoryConnection.create.mockResolvedValueOnce({
        id: 'conn-uuid',
        applicationId: 'app-1',
        provider: 'GITHUB',
        repoOwner: 'henu-os',
        repoName: 'henu-pa',
        githubInstallationId: BigInt(54910284),
        targetBranch: 'main',
        assetPattern: '.*',
        tagPattern: '^v.*',
        autoIngestReleases: true,
        autoPublishChannels: ['NIGHTLY'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createConnection(
        {
          applicationId: 'app-1',
          repoOwner: 'henu-os',
          repoName: 'henu-pa',
          githubInstallationId: 54910284,
        },
        { id: 'admin-1', email: 'admin@henuos.com', role: 'SUPER_ADMIN', permissions: [] },
      );

      expect(result.id).toBe('conn-uuid');
      expect(result.githubInstallationId).toBe(54910284);
      expect(mockAuditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REPOSITORY_CONNECTED' }),
      );
    });
  });

  describe('deleteConnection', () => {
    it('should soft delete and record audit log', async () => {
      mockPrisma.repositoryConnection.findFirst.mockResolvedValueOnce({
        id: 'conn-1',
        repoOwner: 'henu-os',
        repoName: 'henu-pa',
      });
      mockPrisma.repositoryConnection.update.mockResolvedValueOnce({
        id: 'conn-1',
        repoOwner: 'henu-os',
        repoName: 'henu-pa',
        githubInstallationId: BigInt(123),
        isActive: false,
        deletedAt: new Date(),
      });

      const result = await service.deleteConnection('conn-1');
      expect(result.isActive).toBe(false);
      expect(mockAuditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REPOSITORY_CONNECTION_DELETED' }),
      );
    });
  });
});
