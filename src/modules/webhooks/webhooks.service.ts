import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ReleasesService } from '../releases/releases.service';
import { AuditService } from '../audit/audit.service';
import { Prisma, WebhookStatus } from '@prisma/client';
import { AuthenticatedUser } from '@/common/auth/decorators/current-user.decorator';

export interface WebhookIngestResult {
  status: 'received' | 'already_processed' | 'ignored' | 'failed';
  deliveryId: string;
  eventType: string;
  message?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly releasesService?: ReleasesService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async processGitHubWebhook(
    deliveryId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<WebhookIngestResult> {
    this.logger.log(`Received GitHub webhook [${eventType}] with delivery ID: ${deliveryId}`);

    if (eventType === 'ping') {
      return {
        status: 'received',
        deliveryId,
        eventType,
        message: 'GitHub webhook ping received successfully.',
      };
    }

    if (!this.prisma) {
      return {
        status: 'received',
        deliveryId,
        eventType,
        message: 'Webhook received in stateless mode.',
      };
    }

    try {
      // 1. Idempotency check
      const existing = await this.prisma.webhookEvent.findUnique({
        where: { deliveryId },
      });

      if (existing) {
        this.logger.log(
          `Duplicate webhook delivery ignored: ${deliveryId} (Status: ${existing.status})`,
        );
        return {
          status: 'already_processed',
          deliveryId,
          eventType,
          message: 'Webhook delivery previously recorded.',
        };
      }

      // 2. Identify repository connection if payload contains repository info
      let repoConnectionId: string | undefined = undefined;
      const repoPayload = payload['repository'] as
        { owner?: { login?: string }; name?: string } | undefined;
      if (repoPayload?.owner?.login && repoPayload?.name) {
        const repoConn = await this.prisma.repositoryConnection.findUnique({
          where: {
            repoOwner_repoName: {
              repoOwner: repoPayload.owner.login.trim().toLowerCase(),
              repoName: repoPayload.name.trim().toLowerCase(),
            },
          },
        });
        if (repoConn) {
          repoConnectionId = repoConn.id;
        }
      }

      // 3. Record webhook receipt
      const webhookRecord = await this.prisma.webhookEvent.create({
        data: {
          deliveryId,
          eventType,
          status: WebhookStatus.RECEIVED,
          payload: payload as object,
          repositoryConnectionId: repoConnectionId,
          attemptCount: 1,
        },
      });

      // 4. Ingest release event asynchronously or in pipeline
      if (eventType === 'release' && this.releasesService) {
        try {
          await this.prisma.webhookEvent.update({
            where: { id: webhookRecord.id },
            data: { status: WebhookStatus.PROCESSING },
          });

          const releaseResult = await this.releasesService.processReleaseWebhook(
            payload as unknown as Parameters<ReleasesService['processReleaseWebhook']>[0],
          );

          const finalStatus =
            releaseResult.status === 'ignored' ? WebhookStatus.IGNORED : WebhookStatus.PROCESSED;

          await this.prisma.webhookEvent.update({
            where: { id: webhookRecord.id },
            data: {
              status: finalStatus,
              processedAt: new Date(),
            },
          });

          return {
            status: 'received',
            deliveryId,
            eventType,
            message: `Release webhook processed with status: ${releaseResult.status}`,
            details: releaseResult as Record<string, unknown>,
          };
        } catch (releaseErr) {
          const errorMsg = (releaseErr as Error).message;
          this.logger.error(`Release processing failed for delivery ${deliveryId}: ${errorMsg}`);

          await this.prisma.webhookEvent.update({
            where: { id: webhookRecord.id },
            data: {
              status: WebhookStatus.FAILED,
              lastError: errorMsg,
            },
          });

          return {
            status: 'failed',
            deliveryId,
            eventType,
            message: `Release processing encountered an error: ${errorMsg}`,
          };
        }
      }

      // 5. Ingest installation event
      if (eventType === 'installation') {
        try {
          const installResult = await this.handleInstallationEvent(payload);
          await this.prisma.webhookEvent.update({
            where: { id: webhookRecord.id },
            data: {
              status: WebhookStatus.PROCESSED,
              processedAt: new Date(),
            },
          });

          return {
            status: 'received',
            deliveryId,
            eventType,
            message: `Installation event processed: ${installResult.action}`,
            details: installResult,
          };
        } catch (installErr) {
          const errorMsg = (installErr as Error).message;
          this.logger.error(`Installation processing failed for delivery ${deliveryId}: ${errorMsg}`);

          await this.prisma.webhookEvent.update({
            where: { id: webhookRecord.id },
            data: {
              status: WebhookStatus.FAILED,
              lastError: errorMsg,
            },
          });

          return {
            status: 'failed',
            deliveryId,
            eventType,
            message: `Installation processing encountered an error: ${errorMsg}`,
          };
        }
      }

      // 6. Ingest installation_repositories event
      if (eventType === 'installation_repositories') {
        try {
          const repoResult = await this.handleInstallationRepositoriesEvent(payload);
          await this.prisma.webhookEvent.update({
            where: { id: webhookRecord.id },
            data: {
              status: WebhookStatus.PROCESSED,
              processedAt: new Date(),
            },
          });

          return {
            status: 'received',
            deliveryId,
            eventType,
            message: `Installation repositories event processed: ${repoResult.action}`,
            details: repoResult,
          };
        } catch (repoErr) {
          const errorMsg = (repoErr as Error).message;
          this.logger.error(`Installation repositories processing failed for delivery ${deliveryId}: ${errorMsg}`);

          await this.prisma.webhookEvent.update({
            where: { id: webhookRecord.id },
            data: {
              status: WebhookStatus.FAILED,
              lastError: errorMsg,
            },
          });

          return {
            status: 'failed',
            deliveryId,
            eventType,
            message: `Installation repositories processing encountered an error: ${errorMsg}`,
          };
        }
      }

      return {
        status: 'received',
        deliveryId,
        eventType,
        message: 'Webhook delivery acknowledged and queued.',
      };
    } catch (error) {
      this.logger.error(
        `Error processing webhook delivery ${deliveryId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async listWebhookEvents(query: {
    status?: WebhookStatus;
    eventType?: string;
    page?: number;
    limit?: number;
  }) {
    if (!this.prisma) {
      return { data: [], meta: { total: 0, page: 1, limit: 20 } };
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.WebhookEventWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.eventType) where.eventType = query.eventType;

    const [total, events] = await Promise.all([
      this.prisma.webhookEvent.count({ where }),
      this.prisma.webhookEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          repositoryConnection: {
            select: {
              repoOwner: true,
              repoName: true,
              application: { select: { slug: true, displayName: true } },
            },
          },
        },
      }),
    ]);

    return {
      data: events,
      meta: { total, page, limit },
    };
  }

  async getWebhookEvent(id: string) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const event = await this.prisma.webhookEvent.findUnique({
      where: { id },
      include: {
        repositoryConnection: {
          include: {
            application: true,
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Webhook event '${id}' not found.`);
    }

    return event;
  }

  async replayWebhookEvent(
    id: string,
    actor?: AuthenticatedUser,
    ipAddress = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const event = await this.prisma.webhookEvent.findUnique({
      where: { id },
    });

    if (!event) {
      throw new NotFoundException(`Webhook event '${id}' not found.`);
    }

    await this.prisma.webhookEvent.update({
      where: { id },
      data: {
        attemptCount: { increment: 1 },
        status: WebhookStatus.PROCESSING,
      },
    });

    try {
      let releaseResult: { status?: string } | null = null;
      if (event.eventType === 'release' && this.releasesService) {
        releaseResult = await this.releasesService.processReleaseWebhook(
          event.payload as unknown as Parameters<ReleasesService['processReleaseWebhook']>[0],
        );
      }

      const finalStatus =
        releaseResult?.status === 'ignored' ? WebhookStatus.IGNORED : WebhookStatus.PROCESSED;

      const updated = await this.prisma.webhookEvent.update({
        where: { id },
        data: {
          status: finalStatus,
          lastError: null,
          processedAt: new Date(),
        },
      });

      if (this.auditService) {
        await this.auditService.recordLog({
          adminUserId: actor?.id,
          actorEmail: actor?.email || 'system',
          ipAddress,
          userAgent,
          action: 'WEBHOOK_REPLAYED',
          entityType: 'WebhookEvent',
          entityId: id,
          payload: {
            deliveryId: event.deliveryId,
            eventType: event.eventType,
            resultStatus: releaseResult?.status,
          },
        });
      }

      return {
        success: true,
        event: updated,
        releaseResult,
      };
    } catch (err) {
      const errorMsg = (err as Error).message;
      this.logger.error(`Replay failed for webhook event ${id}: ${errorMsg}`);

      await this.prisma.webhookEvent.update({
        where: { id },
        data: {
          status: WebhookStatus.FAILED,
          lastError: errorMsg,
        },
      });

      throw err;
    }
  }

  private async handleInstallationEvent(payload: Record<string, unknown>) {
    const action = (payload['action'] as string) || 'unknown';
    const installation = payload['installation'] as
      | { id: number; account?: { login?: string } }
      | undefined;
    if (!installation?.id || !this.prisma) {
      return { action, count: 0 };
    }

    const installationId = BigInt(installation.id);
    const accountLogin = (installation.account?.login || 'henu-os').trim().toLowerCase();
    const repositories = (payload['repositories'] as Array<{ name: string }>) || [];

    if (action === 'deleted') {
      const updateResult = await this.prisma.repositoryConnection.updateMany({
        where: { githubInstallationId: installationId },
        data: { isActive: false },
      });
      return { action, count: updateResult.count };
    }

    if (action === 'created' || action === 'new_permissions_accepted') {
      let linkedCount = 0;
      for (const repo of repositories) {
        if (!repo?.name) continue;
        const repoName = repo.name.trim().toLowerCase();
        await this.syncRepositoryConnection(accountLogin, repoName, installationId);
        linkedCount++;
      }
      return { action, count: linkedCount };
    }

    return { action, count: 0 };
  }

  private async handleInstallationRepositoriesEvent(payload: Record<string, unknown>) {
    const action = (payload['action'] as string) || 'unknown';
    const installation = payload['installation'] as
      | { id: number; account?: { login?: string } }
      | undefined;
    if (!installation?.id || !this.prisma) {
      return { action, count: 0 };
    }

    const installationId = BigInt(installation.id);
    const accountLogin = (installation.account?.login || 'henu-os').trim().toLowerCase();
    const reposAdded = (payload['repositories_added'] as Array<{ name: string }>) || [];
    const reposRemoved = (payload['repositories_removed'] as Array<{ name: string }>) || [];

    if (action === 'added') {
      let addedCount = 0;
      for (const repo of reposAdded) {
        if (!repo?.name) continue;
        const repoName = repo.name.trim().toLowerCase();
        await this.syncRepositoryConnection(accountLogin, repoName, installationId);
        addedCount++;
      }
      return { action, count: addedCount };
    }

    if (action === 'removed') {
      let removedCount = 0;
      for (const repo of reposRemoved) {
        if (!repo?.name) continue;
        const repoName = repo.name.trim().toLowerCase();
        await this.prisma.repositoryConnection.updateMany({
          where: {
            repoOwner: accountLogin,
            repoName,
          },
          data: { isActive: false },
        });
        removedCount++;
      }
      return { action, count: removedCount };
    }

    return { action, count: 0 };
  }

  private async syncRepositoryConnection(
    repoOwner: string,
    repoName: string,
    githubInstallationId: bigint,
  ) {
    if (!this.prisma) return;

    // 1. Check existing connection
    const existing = await this.prisma.repositoryConnection.findUnique({
      where: {
        repoOwner_repoName: {
          repoOwner,
          repoName,
        },
      },
    });

    if (existing) {
      await this.prisma.repositoryConnection.update({
        where: { id: existing.id },
        data: {
          githubInstallationId,
          isActive: true,
          deletedAt: null,
          lastSyncAt: new Date(),
        },
      });
      return;
    }

    // 2. Check if application exists matching repoName as slug
    let app = await this.prisma.application.findUnique({
      where: { slug: repoName },
    });

    if (!app) {
      // Create minimal Application shell for this connected repository
      app = await this.prisma.application.create({
        data: {
          slug: repoName,
          displayName: repoName
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          summary: `HENU ${repoName} service`,
          description: `Official HENU repository connection for ${repoOwner}/${repoName}.`,
          category: 'Platforms',
          developer: 'HENU OS PRIVATE LIMITED',
          iconUrl: 'https://www.henuos.in/favicon.ico',
          status: 'ACTIVE',
        },
      });
    }

    // 3. Create the repository connection record
    await this.prisma.repositoryConnection.create({
      data: {
        applicationId: app.id,
        provider: 'GITHUB',
        repoOwner,
        repoName,
        githubInstallationId,
        targetBranch: 'main',
        assetPattern: '.*\\.(exe|msi|dmg|AppImage|deb|rpm|zip)$',
        tagPattern: '^v?[0-9]+\\.[0-9]+\\.[0-9]+',
        autoIngestReleases: true,
        isActive: true,
        lastSyncAt: new Date(),
      },
    });
  }
}
