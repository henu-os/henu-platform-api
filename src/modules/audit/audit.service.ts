import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export interface RecordAuditParams {
  adminUserId?: string;
  actorEmail: string;
  ipAddress: string;
  userAgent?: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
}

export interface QueryAuditParams {
  page?: number;
  limit?: number;
  entityType?: string;
  entityId?: string;
  actorEmail?: string;
  action?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async recordLog(params: RecordAuditParams): Promise<void> {
    const sanitizedPayload = this.sanitizePayload(params.payload);

    this.logger.log(
      `AUDIT: [${params.action}] by ${params.actorEmail} on ${params.entityType}:${params.entityId}`,
    );

    if (!this.prisma) {
      return;
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          adminUserId: params.adminUserId,
          actorEmail: params.actorEmail,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          payload: sanitizedPayload as object,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to record audit log: ${(error as Error).message}`);
    }
  }

  async queryLogs(params: QueryAuditParams) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
    const skip = (page - 1) * limit;

    if (!this.prisma) {
      return { data: [], meta: { total: 0, page, limit } };
    }

    const where: Record<string, unknown> = {};
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;
    if (params.actorEmail) where.actorEmail = { contains: params.actorEmail, mode: 'insensitive' };
    if (params.action) where.action = params.action;

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data,
      meta: { total, page, limit },
    };
  }

  private sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = new Set([
      'password',
      'passwordHash',
      'mfaSecret',
      'token',
      'refreshToken',
      'refreshTokenHash',
      'secret',
      'privateKey',
    ]);

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (sensitiveKeys.has(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizePayload(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}
