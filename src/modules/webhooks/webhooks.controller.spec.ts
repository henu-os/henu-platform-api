import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService, WebhookIngestResult } from './webhooks.service';
import { GitHubSignatureGuard } from './guards/github-signature.guard';
import { ConfigService } from '@nestjs/config';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let webhooksService: Partial<WebhooksService>;

  beforeEach(async () => {
    webhooksService = {
      processGitHubWebhook: jest.fn().mockImplementation(
        async (deliveryId: string, eventType: string): Promise<WebhookIngestResult> => ({
          status: 'received',
          deliveryId,
          eventType,
          message: 'Acknowledged',
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: webhooksService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret'),
          },
        },
      ],
    })
      .overrideGuard(GitHubSignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should process ping webhook event with delivery headers', async () => {
    const result = await controller.handleGitHubWebhook('del-123', 'ping', { zen: 'Keep it simple' });

    expect(result.status).toBe('received');
    expect(result.deliveryId).toBe('del-123');
    expect(result.eventType).toBe('ping');
    expect(webhooksService.processGitHubWebhook).toHaveBeenCalledWith('del-123', 'ping', {
      zen: 'Keep it simple',
    });
  });

  it('should process release webhook event with delivery headers', async () => {
    const payload = {
      action: 'published',
      release: { tag_name: 'v1.0.0', id: 999 },
      repository: { name: 'henu-pa', owner: { login: 'henu-os' } },
    };

    const result = await controller.handleGitHubWebhook('del-rel-456', 'release', payload);

    expect(result.status).toBe('received');
    expect(result.deliveryId).toBe('del-rel-456');
    expect(result.eventType).toBe('release');
    expect(webhooksService.processGitHubWebhook).toHaveBeenCalledWith(
      'del-rel-456',
      'release',
      payload,
    );
  });

  it('should apply safe fallback delivery ID and event type if headers are omitted', async () => {
    const result = await controller.handleGitHubWebhook('', '', {});

    expect(result.deliveryId).toMatch(/^fallback-/);
    expect(result.eventType).toBe('unknown');
  });
});
