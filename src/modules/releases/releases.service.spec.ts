/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ReleasesService, GitHubWebhookReleasePayload } from './releases.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { GitHubAppService } from '@/modules/github/github.service';
import { ReleaseStatus, OperatingSystem, CpuArchitecture, PackageFormat } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('ReleasesService', () => {
  let service: ReleasesService;
  let prisma: any;
  let auditService: any;
  let githubAppService: any;

  const mockApp = {
    id: 'app-1',
    slug: 'henu-pa',
    displayName: 'HENU Personal Assistant',
    compatibilities: [
      {
        id: 'compat-win-x64',
        os: OperatingSystem.WINDOWS,
        arch: CpuArchitecture.X86_64,
        packageFormat: PackageFormat.EXE,
        isSupported: true,
      },
      {
        id: 'compat-mac-arm64',
        os: OperatingSystem.MACOS,
        arch: CpuArchitecture.ARM64,
        packageFormat: PackageFormat.DMG,
        isSupported: true,
      },
    ],
  };

  const mockConnection = {
    id: 'conn-1',
    applicationId: 'app-1',
    repoOwner: 'henu-os',
    repoName: 'henu-pa',
    githubInstallationId: BigInt(12345),
    assetPattern:
      '^henu-(.+)-(windows|macos|linux)-(x64|arm64|universal)\\.(exe|msi|dmg|pkg|deb|rpm|appimage)$',
    autoIngestReleases: true,
    autoPublishChannels: ['BETA'],
    isActive: true,
    deletedAt: null,
    application: mockApp,
  };

  const mockStableChannel = {
    id: 'channel-stable-id',
    name: 'STABLE',
    isDefault: true,
  };

  const mockBetaChannel = {
    id: 'channel-beta-id',
    name: 'BETA',
    isDefault: false,
  };

  const mockNightlyChannel = {
    id: 'channel-nightly-id',
    name: 'NIGHTLY',
    isDefault: false,
  };

  beforeEach(async () => {
    prisma = {
      repositoryConnection: {
        findUnique: jest.fn(),
      },
      releaseChannel: {
        upsert: jest.fn().mockImplementation(({ where }) => {
          if (where.name === 'STABLE') return Promise.resolve(mockStableChannel);
          if (where.name === 'NIGHTLY') return Promise.resolve(mockNightlyChannel);
          return Promise.resolve(mockBetaChannel);
        }),
      },
      release: {
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      releaseAsset: {
        upsert: jest.fn(),
      },
    };

    auditService = {
      recordLog: jest.fn().mockResolvedValue({}),
    };

    githubAppService = {
      streamAssetAndCalculateSha256: jest.fn().mockResolvedValue({
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        byteLength: 1048576,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReleasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: GitHubAppService, useValue: githubAppService },
      ],
    }).compile();

    service = module.get<ReleasesService>(ReleasesService);
  });

  describe('processReleaseWebhook', () => {
    it('should ignore draft releases completely', async () => {
      prisma.repositoryConnection.findUnique.mockResolvedValue(mockConnection);

      const payload: GitHubWebhookReleasePayload = {
        action: 'published',
        release: {
          id: 101,
          tag_name: 'v1.0.0',
          target_commitish: 'main',
          name: 'v1.0.0 draft',
          draft: true,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
          body: 'Draft body',
          assets: [],
        },
        repository: {
          name: 'henu-pa',
          owner: { login: 'henu-os' },
        },
      };

      const result = await service.processReleaseWebhook(payload);
      expect(result.status).toBe('ignored');
      expect(prisma.release.upsert).not.toHaveBeenCalled();
    });

    it('should mark release as REJECTED when tag has non-compliant SemVer', async () => {
      prisma.repositoryConnection.findUnique.mockResolvedValue(mockConnection);
      prisma.release.upsert.mockResolvedValue({ id: 'rel-rejected-1' });

      const payload: GitHubWebhookReleasePayload = {
        action: 'published',
        release: {
          id: 102,
          tag_name: 'invalid-tag-1.0',
          target_commitish: 'main',
          name: 'Invalid Tag',
          draft: false,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
          body: '',
          assets: [],
        },
        repository: {
          name: 'henu-pa',
          owner: { login: 'henu-os' },
        },
      };

      const result = await service.processReleaseWebhook(payload);
      expect(result.status).toBe('rejected');
      expect(prisma.release.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            status: ReleaseStatus.REJECTED,
          }),
        }),
      );
    });

    it('should mark release as REJECTED when no installable assets match platform compatibility', async () => {
      prisma.repositoryConnection.findUnique.mockResolvedValue(mockConnection);
      prisma.release.upsert.mockResolvedValue({ id: 'rel-validating-1' });
      prisma.release.update.mockResolvedValue({
        id: 'rel-validating-1',
        status: ReleaseStatus.REJECTED,
      });

      const payload: GitHubWebhookReleasePayload = {
        action: 'published',
        release: {
          id: 103,
          tag_name: 'v1.0.0',
          target_commitish: 'abcdef1234567890',
          name: 'v1.0.0',
          draft: false,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
          body: 'Release notes',
          assets: [
            {
              id: 991,
              name: 'source.tar.gz',
              size: 50000,
              browser_download_url:
                'https://github.com/henu-os/henu-pa/releases/download/v1.0.0/source.tar.gz',
              content_type: 'application/gzip',
            },
            {
              id: 992,
              name: 'checksums.sha256',
              size: 120,
              browser_download_url:
                'https://github.com/henu-os/henu-pa/releases/download/v1.0.0/checksums.sha256',
              content_type: 'text/plain',
            },
          ],
        },
        repository: {
          name: 'henu-pa',
          owner: { login: 'henu-os' },
        },
      };

      const result = await service.processReleaseWebhook(payload);
      expect(result.status).toBe('rejected');
      expect(prisma.release.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ReleaseStatus.REJECTED,
            rejectionReason: expect.stringContaining(
              'contains no verified installable binary packages',
            ),
          }),
        }),
      );
    });

    it('should ingest valid stable release into VALIDATED state requiring admin approval', async () => {
      prisma.repositoryConnection.findUnique.mockResolvedValue(mockConnection);
      prisma.release.upsert.mockResolvedValue({ id: 'rel-valid-1' });
      prisma.releaseAsset.upsert.mockResolvedValue({ id: 'asset-1' });
      prisma.release.update.mockResolvedValue({
        id: 'rel-valid-1',
        status: ReleaseStatus.VALIDATED,
        version: '1.0.0',
      });

      const payload: GitHubWebhookReleasePayload = {
        action: 'published',
        release: {
          id: 104,
          tag_name: 'v1.0.0',
          target_commitish: 'commit-sha-12345',
          name: 'v1.0.0 Official Release',
          draft: false,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
          body: 'Stable launch notes',
          assets: [
            {
              id: 501,
              name: 'henu-pa-windows-x64.exe',
              size: 85000000,
              browser_download_url:
                'https://github.com/henu-os/henu-pa/releases/download/v1.0.0/henu-pa-windows-x64.exe',
              content_type: 'application/vnd.microsoft.portable-executable',
            },
            {
              id: 502,
              name: 'henu-pa-macos-arm64.dmg',
              size: 92000000,
              browser_download_url:
                'https://github.com/henu-os/henu-pa/releases/download/v1.0.0/henu-pa-macos-arm64.dmg',
              content_type: 'application/x-apple-diskimage',
            },
          ],
        },
        repository: {
          name: 'henu-pa',
          owner: { login: 'henu-os' },
        },
      };

      const result = await service.processReleaseWebhook(payload);
      expect(result.status).toBe('validated');
      expect(result.channel).toBe('STABLE');

      // Asset streaming SHA256 was called for both installable assets
      expect(githubAppService.streamAssetAndCalculateSha256).toHaveBeenCalledTimes(2);

      // Release was saved in VALIDATED status (STABLE is never auto-published)
      expect(prisma.release.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ReleaseStatus.VALIDATED,
            publishedAt: null,
          }),
        }),
      );
    });

    it('should auto-publish BETA release when connection allows it', async () => {
      prisma.repositoryConnection.findUnique.mockResolvedValue(mockConnection);
      prisma.release.upsert.mockResolvedValue({ id: 'rel-beta-1' });
      prisma.releaseAsset.upsert.mockResolvedValue({ id: 'asset-beta-1' });
      prisma.release.update.mockResolvedValue({
        id: 'rel-beta-1',
        status: ReleaseStatus.PUBLISHED,
        version: '1.1.0-beta.1',
      });

      const payload: GitHubWebhookReleasePayload = {
        action: 'published',
        release: {
          id: 105,
          tag_name: 'v1.1.0-beta.1',
          target_commitish: 'beta-sha',
          name: 'v1.1.0-beta.1 Pre-release',
          draft: false,
          prerelease: true,
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
          body: 'Beta notes',
          assets: [
            {
              id: 503,
              name: 'henu-pa-windows-x64.exe',
              size: 86000000,
              browser_download_url:
                'https://github.com/henu-os/henu-pa/releases/download/v1.1.0-beta.1/henu-pa-windows-x64.exe',
              content_type: 'application/octet-stream',
            },
          ],
        },
        repository: {
          name: 'henu-pa',
          owner: { login: 'henu-os' },
        },
      };

      const result = await service.processReleaseWebhook(payload);
      expect(result.status).toBe('published');
      expect(result.channel).toBe('BETA');
      expect(prisma.release.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ReleaseStatus.PUBLISHED,
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('Release Lifecycle Management', () => {
    it('should approve a VALIDATED release', async () => {
      prisma.release.findUnique.mockResolvedValue({
        id: 'rel-1',
        version: '1.0.0',
        status: ReleaseStatus.VALIDATED,
        assets: [],
      });
      prisma.release.update.mockResolvedValue({
        id: 'rel-1',
        status: ReleaseStatus.APPROVED,
      });

      const res = await service.approveRelease('rel-1');
      expect(res.status).toBe(ReleaseStatus.APPROVED);
      expect(auditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RELEASE_APPROVED',
        }),
      );
    });

    it('should reject approving a REJECTED release', async () => {
      prisma.release.findUnique.mockResolvedValue({
        id: 'rel-rejected',
        version: '1.0.0',
        status: ReleaseStatus.REJECTED,
        rejectionReason: 'Corrupted payload',
        assets: [],
      });

      await expect(service.approveRelease('rel-rejected')).rejects.toThrow(BadRequestException);
    });

    it('should promote an APPROVED release to STABLE and publish it', async () => {
      prisma.release.findUnique.mockResolvedValue({
        id: 'rel-1',
        version: '1.0.0',
        status: ReleaseStatus.APPROVED,
        channel: { name: 'BETA' },
        assets: [],
      });
      prisma.release.update.mockResolvedValue({
        id: 'rel-1',
        status: ReleaseStatus.PUBLISHED,
      });

      const res = await service.promoteRelease('rel-1', 'STABLE');
      expect(res.status).toBe(ReleaseStatus.PUBLISHED);
      expect(auditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RELEASE_PROMOTED',
        }),
      );
    });

    it('should revoke a release with administrative reason', async () => {
      prisma.release.findUnique.mockResolvedValue({
        id: 'rel-1',
        version: '1.0.0',
        status: ReleaseStatus.PUBLISHED,
      });
      prisma.release.update.mockResolvedValue({
        id: 'rel-1',
        status: ReleaseStatus.REVOKED,
      });

      const res = await service.revokeRelease('rel-1', 'Critical zero-day exploit discovered');
      expect(res.status).toBe(ReleaseStatus.REVOKED);
      expect(prisma.release.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ReleaseStatus.REVOKED,
            revocationReason: 'Critical zero-day exploit discovered',
          }),
        }),
      );
      expect(auditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RELEASE_REVOKED',
        }),
      );
    });
  });
});
