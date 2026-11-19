import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedUser } from '@/common/auth/decorators/current-user.decorator';
import {
  CreateRepositoryConnectionDto,
  UpdateRepositoryConnectionDto,
} from './dto/repository-connection.dto';
import { RepositoryConnection } from '@prisma/client';

type ConnectionWithRelations = RepositoryConnection & {
  application?: { id: string; slug: string; displayName: string };
  releases?: unknown[];
};

@Injectable()
export class RepositoriesManagementService {
  constructor(
    private readonly auditService: AuditService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async createConnection(
    dto: CreateRepositoryConnectionDto,
    actor?: AuthenticatedUser,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const app = await this.prisma.application.findFirst({
      where: { id: dto.applicationId, deletedAt: null },
    });

    if (!app) {
      throw new NotFoundException(`Application '${dto.applicationId}' not found.`);
    }

    const repoOwner = dto.repoOwner.trim().toLowerCase();
    const repoName = dto.repoName.trim().toLowerCase();

    // Enforce repository uniqueness
    const existing = await this.prisma.repositoryConnection.findUnique({
      where: {
        repoOwner_repoName: {
          repoOwner,
          repoName,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Repository '${repoOwner}/${repoName}' is already connected to application '${existing.applicationId}'.`,
      );
    }

    const connection = await this.prisma.repositoryConnection.create({
      data: {
        applicationId: dto.applicationId,
        provider: 'GITHUB',
        repoOwner,
        repoName,
        githubInstallationId: BigInt(dto.githubInstallationId),
        targetBranch: dto.targetBranch ?? 'main',
        assetPattern: dto.assetPattern ?? '.*\\.(exe|msi|dmg|AppImage|deb|rpm|zip)$',
        tagPattern: dto.tagPattern ?? '^v?[0-9]+\\.[0-9]+\\.[0-9]+',
        autoIngestReleases: dto.autoIngestReleases ?? true,
        autoPublishChannels: dto.autoPublishChannels ?? [],
        isActive: dto.isActive ?? true,
      },
      include: {
        application: {
          select: { id: true, slug: true, displayName: true },
        },
      },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'REPOSITORY_CONNECTED',
      entityType: 'RepositoryConnection',
      entityId: connection.id,
      payload: {
        repo: `${repoOwner}/${repoName}`,
        applicationId: dto.applicationId,
        githubInstallationId: dto.githubInstallationId,
      },
    });

    return this.serializeConnection(connection);
  }

  async listConnections(page = 1, limit = 20) {
    if (!this.prisma) {
      return { data: [], meta: { total: 0, page, limit } };
    }

    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.repositoryConnection.count({ where: { deletedAt: null } }),
      this.prisma.repositoryConnection.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          application: {
            select: { id: true, slug: true, displayName: true },
          },
        },
      }),
    ]);

    return {
      data: data.map((item) => this.serializeConnection(item)),
      meta: { total, page, limit },
    };
  }

  async getConnection(id: string) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const connection = await this.prisma.repositoryConnection.findFirst({
      where: { id, deletedAt: null },
      include: {
        application: {
          select: { id: true, slug: true, displayName: true },
        },
        releases: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { channel: true },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(`Repository connection '${id}' not found.`);
    }

    return this.serializeConnection(connection);
  }

  async updateConnection(
    id: string,
    dto: UpdateRepositoryConnectionDto,
    actor?: AuthenticatedUser,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const connection = await this.prisma.repositoryConnection.findFirst({
      where: { id, deletedAt: null },
    });

    if (!connection) {
      throw new NotFoundException(`Repository connection '${id}' not found.`);
    }

    const updated = await this.prisma.repositoryConnection.update({
      where: { id },
      data: {
        ...(dto.targetBranch !== undefined && { targetBranch: dto.targetBranch }),
        ...(dto.assetPattern !== undefined && { assetPattern: dto.assetPattern }),
        ...(dto.tagPattern !== undefined && { tagPattern: dto.tagPattern }),
        ...(dto.autoIngestReleases !== undefined && { autoIngestReleases: dto.autoIngestReleases }),
        ...(dto.autoPublishChannels !== undefined && {
          autoPublishChannels: dto.autoPublishChannels,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        application: {
          select: { id: true, slug: true, displayName: true },
        },
      },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'REPOSITORY_CONNECTION_UPDATED',
      entityType: 'RepositoryConnection',
      entityId: id,
      payload: { changes: dto },
    });

    return this.serializeConnection(updated);
  }

  async updateStatus(
    id: string,
    isActive: boolean,
    actor?: AuthenticatedUser,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const connection = await this.prisma.repositoryConnection.findFirst({
      where: { id, deletedAt: null },
    });

    if (!connection) {
      throw new NotFoundException(`Repository connection '${id}' not found.`);
    }

    const updated = await this.prisma.repositoryConnection.update({
      where: { id },
      data: { isActive },
      include: {
        application: {
          select: { id: true, slug: true, displayName: true },
        },
      },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'REPOSITORY_CONNECTION_STATUS_CHANGED',
      entityType: 'RepositoryConnection',
      entityId: id,
      payload: { isActive },
    });

    return this.serializeConnection(updated);
  }

  async deleteConnection(
    id: string,
    actor?: AuthenticatedUser,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const connection = await this.prisma.repositoryConnection.findFirst({
      where: { id, deletedAt: null },
    });

    if (!connection) {
      throw new NotFoundException(`Repository connection '${id}' not found.`);
    }

    const deleted = await this.prisma.repositoryConnection.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'REPOSITORY_CONNECTION_DELETED',
      entityType: 'RepositoryConnection',
      entityId: id,
      payload: { repo: `${connection.repoOwner}/${connection.repoName}` },
    });

    return this.serializeConnection(deleted);
  }

  private serializeConnection(conn: ConnectionWithRelations) {
    return {
      id: conn.id,
      applicationId: conn.applicationId,
      application: conn.application,
      provider: conn.provider,
      repoOwner: conn.repoOwner,
      repoName: conn.repoName,
      githubInstallationId: Number(conn.githubInstallationId),
      targetBranch: conn.targetBranch,
      assetPattern: conn.assetPattern,
      tagPattern: conn.tagPattern,
      autoIngestReleases: conn.autoIngestReleases,
      autoPublishChannels: conn.autoPublishChannels,
      isActive: conn.isActive,
      lastSyncAt: conn.lastSyncAt ? conn.lastSyncAt.toISOString() : null,
      createdAt: conn.createdAt ? conn.createdAt.toISOString() : null,
      updatedAt: conn.updatedAt ? conn.updatedAt.toISOString() : null,
      releases: conn.releases,
    };
  }
}
