/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { GitHubAppService } from './github.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Readable } from 'stream';

describe('GitHubAppService', () => {
  let service: GitHubAppService;
  let configService: any;

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'github.appId') return '12345';
        if (key === 'github.privateKeyBase64')
          return Buffer.from('dummy-rsa-key').toString('base64');
        if (key === 'github.clientId') return 'client-123';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [GitHubAppService, { provide: ConfigService, useValue: configService }],
    }).compile();

    service = module.get<GitHubAppService>(GitHubAppService);
  });

  describe('configuration & authentication', () => {
    it('should throw UnauthorizedException if credentials are missing', () => {
      configService.get.mockReturnValue(null);
      expect(() => service.getAppOctokit()).toThrow(UnauthorizedException);
    });

    it('should reuse cached installation token when still valid', async () => {
      const validUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 mins in future
      (service as any).tokenCache.set(12345, {
        token: 'cached-ghs-token-123',
        expiresAt: validUntil,
      });

      const token = await service.getInstallationToken(12345);
      expect(token).toBe('cached-ghs-token-123');
    });
  });

  describe('streamAssetAndCalculateSha256', () => {
    it('should stream chunks and compute accurate SHA-256 hash', async () => {
      const sampleContent = 'HENU Platform Binary Package Stream Verification Payload';
      const expectedSha256 = crypto.createHash('sha256').update(sampleContent).digest('hex');

      const stream = new Readable();
      stream.push(Buffer.from('HENU Platform Binary '));
      stream.push(Buffer.from('Package Stream Verification Payload'));
      stream.push(null);

      jest.spyOn(service, 'getInstallationOctokit').mockResolvedValue({
        rest: {
          repos: {
            getReleaseAsset: jest.fn().mockResolvedValue({
              data: stream,
            }),
          },
        },
      } as any);

      const result = await service.streamAssetAndCalculateSha256(12345, 'henu-os', 'henu-pa', 999);

      expect(result.sha256).toBe(expectedSha256);
      expect(result.byteLength).toBe(Buffer.byteLength(sampleContent));
    });

    it('should calculate SHA-256 accurately when octokit returns a Buffer', async () => {
      const sampleBuffer = Buffer.from('Binary buffer payload content');
      const expectedSha256 = crypto.createHash('sha256').update(sampleBuffer).digest('hex');

      jest.spyOn(service, 'getInstallationOctokit').mockResolvedValue({
        rest: {
          repos: {
            getReleaseAsset: jest.fn().mockResolvedValue({
              data: sampleBuffer,
            }),
          },
        },
      } as any);

      const result = await service.streamAssetAndCalculateSha256(12345, 'henu-os', 'henu-pa', 1001);

      expect(result.sha256).toBe(expectedSha256);
      expect(result.byteLength).toBe(sampleBuffer.length);
    });
  });

  describe('validateRepositoryAccess', () => {
    it('should return accessible true when repo is reachable', async () => {
      jest.spyOn(service, 'getInstallationOctokit').mockResolvedValue({
        rest: {
          repos: {
            get: jest.fn().mockResolvedValue({
              data: {
                permissions: { push: true, pull: true, admin: false },
                default_branch: 'main',
              },
            }),
          },
        },
      } as any);

      const res = await service.validateRepositoryAccess(12345, 'henu-os', 'henu-pa');
      expect(res.accessible).toBe(true);
      expect(res.defaultBranch).toBe('main');
    });

    it('should return accessible false when repo lookup fails or errors', async () => {
      jest.spyOn(service, 'getInstallationOctokit').mockResolvedValue({
        rest: {
          repos: {
            get: jest.fn().mockRejectedValue(new Error('Repository not found (404)')),
          },
        },
      } as any);

      const res = await service.validateRepositoryAccess(12345, 'henu-os', 'private-repo');
      expect(res.accessible).toBe(false);
    });
  });

  describe('getRateLimit', () => {
    it('should retrieve rate limit details for installation', async () => {
      const resetTimestamp = Math.floor(Date.now() / 1000) + 3600;

      jest.spyOn(service, 'getInstallationOctokit').mockResolvedValue({
        rest: {
          rateLimit: {
            get: jest.fn().mockResolvedValue({
              data: {
                rate: {
                  limit: 5000,
                  remaining: 4980,
                  reset: resetTimestamp,
                  used: 20,
                },
              },
            }),
          },
        },
      } as any);

      const rateInfo = await service.getRateLimit(12345);
      expect(rateInfo.limit).toBe(5000);
      expect(rateInfo.remaining).toBe(4980);
      expect(rateInfo.used).toBe(20);
      expect(rateInfo.reset).toEqual(new Date(resetTimestamp * 1000));
    });
  });
});
