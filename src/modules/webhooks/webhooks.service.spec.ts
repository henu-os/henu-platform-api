/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '@/prisma/prisma.service';
import { ReleasesService } from '../releases/releases.service';
import { AuditService } from '../audit/audit.service';
import { WebhookStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: any;
  let releasesService: any;
  let auditService: any;

  beforeEach(async () => {
    prisma = {
      webhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      repositoryConnection: {
        findUnique: jest.fn(),
      },
    };

    releasesService = {
      processReleaseWebhook: jest.fn(),
    };

    auditService = {
      recordLog: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReleasesService, useValue: releasesService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  describe('processGitHubWebhook', () => {
    it('should acknowledge ping events immediately without database insertion', async () => {
      const res = await service.processGitHubWebhook('ping-del-1', 'ping', {
        zen: 'Keep it logically awesome.',
      });
      expect(res.status).toBe('received');
      expect(res.eventType).toBe('ping');
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    });

    it('should prevent duplicate processing if delivery ID has already been recorded', async () => {
      prisma.webhookEvent.findUnique.mockResolvedValue({
        id: 'wh-1',
        deliveryId: 'del-dup-1',
        status: WebhookStatus.PROCESSED,
      });

      const res = await service.processGitHubWebhook('del-dup-1', 'release', {});
      expect(res.status).toBe('already_processed');
      expect(res.message).toContain('previously recorded');
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    });

    it('should record webhook event and invoke release processing pipeline for release events', async () => {
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.repositoryConnection.findUnique.mockResolvedValue({ id: 'repo-conn-1' });
      prisma.webhookEvent.create.mockResolvedValue({
        id: 'wh-record-1',
        deliveryId: 'del-rel-1',
        status: WebhookStatus.RECEIVED,
      });
      releasesService.processReleaseWebhook.mockResolvedValue({
        status: 'validated',
        releaseId: 'rel-123',
        version: '1.0.0',
      });

      const payload = {
        action: 'published',
        release: { id: 1 },
        repository: { name: 'henu-pa', owner: { login: 'henu-os' } },
      };

      const res = await service.processGitHubWebhook('del-rel-1', 'release', payload);

      expect(res.status).toBe('received');
      expect(res.message).toContain('Release webhook processed with status: validated');
      expect(prisma.webhookEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryId: 'del-rel-1',
            eventType: 'release',
            repositoryConnectionId: 'repo-conn-1',
          }),
        }),
      );
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-record-1' },
          data: expect.objectContaining({
            status: WebhookStatus.PROCESSED,
          }),
        }),
      );
    });

    it('should mark webhook as FAILED and record error if release processing throws', async () => {
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.repositoryConnection.findUnique.mockResolvedValue(null);
      prisma.webhookEvent.create.mockResolvedValue({
        id: 'wh-record-fail',
        deliveryId: 'del-rel-fail',
      });
      releasesService.processReleaseWebhook.mockRejectedValue(
        new Error('Network failure streaming asset'),
      );

      const payload = {
        action: 'published',
        release: { id: 2 },
        repository: { name: 'henu-pa', owner: { login: 'henu-os' } },
      };

      const res = await service.processGitHubWebhook('del-rel-fail', 'release', payload);

      expect(res.status).toBe('failed');
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-record-fail' },
          data: expect.objectContaining({
            status: WebhookStatus.FAILED,
            lastError: 'Network failure streaming asset',
          }),
        }),
      );
    });
  });

  describe('replayWebhookEvent', () => {
    it('should throw NotFoundException when replaying non-existent webhook event', async () => {
      prisma.webhookEvent.findUnique.mockResolvedValue(null);

      await expect(service.replayWebhookEvent('wh-missing')).rejects.toThrow(NotFoundException);
    });

    it('should replay a failed event through ingestion pipeline and mark it PROCESSED', async () => {
      const storedEvent = {
        id: 'wh-failed-1',
        deliveryId: 'del-failed-1',
        eventType: 'release',
        payload: {
          action: 'published',
          release: { id: 50 },
          repository: { name: 'henu-pa', owner: { login: 'henu-os' } },
        },
        attemptCount: 1,
        status: WebhookStatus.FAILED,
      };

      prisma.webhookEvent.findUnique.mockResolvedValue(storedEvent);
      releasesService.processReleaseWebhook.mockResolvedValue({
        status: 'validated',
        releaseId: 'rel-50',
      });
      prisma.webhookEvent.update.mockResolvedValue({
        ...storedEvent,
        status: WebhookStatus.PROCESSED,
        attemptCount: 2,
      });

      const res = await service.replayWebhookEvent('wh-failed-1');

      expect(res.success).toBe(true);
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-failed-1' },
          data: expect.objectContaining({
            status: WebhookStatus.PROCESSED,
            lastError: null,
          }),
        }),
      );
      expect(auditService.recordLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WEBHOOK_REPLAYED',
        }),
      );
    });
  });
});
