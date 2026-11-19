import { Test, TestingModule } from '@nestjs/testing';
import { HubService } from './hub.service';
import { PrismaService } from '@/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { TargetOs, TargetArch } from './dto/update-check.dto';

describe('HubService', () => {
  let service: HubService;

  const mockPrisma = {
    catalogueRevision: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HubService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<HubService>(HubService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLatestCatalogue', () => {
    it('should return fallback manifest when no revision is found in database', async () => {
      mockPrisma.catalogueRevision.findFirst.mockResolvedValueOnce(null);
      const { manifest } = await service.getLatestCatalogue();
      expect(manifest.schemaVersion).toBe('1.0.0');
      expect(manifest.revision).toBe(0);
      expect(manifest.applications).toEqual([]);
    });

    it('should return active revision manifest if stored in database', async () => {
      const mockManifest = {
        schemaVersion: '1.0.0',
        revision: 5,
        generatedAt: '2026-11-19T00:00:00.000Z',
        contentHash: 'abc123hash',
        channels: ['STABLE'],
        applications: [
          {
            slug: 'henu-pa',
            displayName: 'HENU PA',
            summary: 'Personal Assistant',
            description: 'Productivity tool',
            category: 'PRODUCTIVITY',
            developer: 'HENU OS',
            iconUrl: 'https://example.com/icon.svg',
            featured: true,
            supportedPlatforms: [],
            channels: {},
          },
        ],
      };

      mockPrisma.catalogueRevision.findFirst.mockResolvedValueOnce({
        id: 'rev-uuid',
        revisionNumber: 5,
        contentHash: 'abc123hash',
        manifestPayload: mockManifest,
      });

      const { manifest, contentHash } = await service.getLatestCatalogue();
      expect(manifest.revision).toBe(5);
      expect(contentHash).toBe('abc123hash');
      expect(manifest.applications[0].slug).toBe('henu-pa');
    });
  });

  describe('getApplicationBySlug', () => {
    it('should throw NotFoundException if app is not in manifest', async () => {
      mockPrisma.catalogueRevision.findFirst.mockResolvedValueOnce(null);
      await expect(service.getApplicationBySlug('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkForUpdates', () => {
    it('should return updateAvailable: true when a higher version exists with matching asset', async () => {
      const mockManifest = {
        schemaVersion: '1.0.0',
        revision: 1,
        generatedAt: '2026-11-19T00:00:00.000Z',
        contentHash: 'hash',
        channels: ['STABLE'],
        applications: [
          {
            slug: 'henu-ai',
            displayName: 'HENU AI',
            summary: 'AI Engine',
            description: 'AI tooling',
            category: 'AI',
            developer: 'HENU OS',
            iconUrl: 'https://example.com/ai.svg',
            featured: false,
            supportedPlatforms: [],
            channels: {
              STABLE: {
                version: '1.2.0',
                tagName: 'v1.2.0',
                publishedAt: '2026-11-19T00:00:00.000Z',
                changelog: 'New release',
                assets: [
                  {
                    fileName: 'henu-ai-setup.exe',
                    downloadUrl: 'https://example.com/henu-ai.exe',
                    sizeBytes: 50000000,
                    sha256: 'deadbeef',
                    os: 'WINDOWS',
                    arch: 'X86_64',
                    packageFormat: 'EXE',
                  },
                ],
              },
            },
          },
        ],
      };

      mockPrisma.catalogueRevision.findFirst.mockResolvedValueOnce({
        id: 'rev-uuid',
        revisionNumber: 1,
        contentHash: 'hash',
        manifestPayload: mockManifest,
      });

      const result = await service.checkForUpdates({
        app: 'henu-ai',
        channel: 'STABLE',
        currentVersion: '1.0.0',
        os: TargetOs.WINDOWS,
        arch: TargetArch.X86_64,
      });

      expect(result.updateAvailable).toBe(true);
      expect(result.latestVersion).toBe('1.2.0');
      expect(result.asset?.fileName).toBe('henu-ai-setup.exe');
    });
  });
});
