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
}
