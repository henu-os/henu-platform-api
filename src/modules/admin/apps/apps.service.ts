import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedUser } from '@/common/auth/decorators/current-user.decorator';
import { CatalogueManagementService } from '../catalogue/catalogue.service';
import { sanitizeBigInt } from '@/common/interceptors/bigint.interceptor';
import {
  CreateApplicationDto,
  UpdateApplicationDto,
  ApplicationStatusEnum,
  PlatformCompatibilityDto,
  QueryApplicationsDto,
} from './dto/app-management.dto';
import {
  Prisma,
  ApplicationStatus,
  ApplicationType,
  OperatingSystem,
  CpuArchitecture,
  PackageFormat,
} from '@prisma/client';

@Injectable()
export class AppsManagementService {
  constructor(
    private readonly auditService: AuditService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly catalogueService?: CatalogueManagementService,
  ) {}

  async registerApplication(
    dto: CreateApplicationDto,
    actor?: AuthenticatedUser,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) {
      throw new Error('Database unavailable.');
    }

    const existing = await this.prisma.application.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(`Application with unique slug '${dto.slug}' already exists.`);
    }

    const created = await this.prisma.application.create({
      data: {
        slug: dto.slug,
        displayName: dto.displayName,
        summary: dto.summary,
        description: dto.description,
        category: dto.category,
        developer: dto.developer ?? 'HENU OS PRIVATE LIMITED',
        iconUrl:
          dto.iconUrl && dto.iconUrl.trim().length > 0
            ? dto.iconUrl.trim()
            : `https://cdn.henuos.example/assets/icons/${dto.slug}.svg`,
        bannerUrl:
          dto.bannerUrl && dto.bannerUrl.trim().length > 0
            ? dto.bannerUrl.trim()
            : null,
        homepageUrl: dto.homepageUrl,
        docsUrl: dto.docsUrl,
        webAppUrl: dto.webAppUrl,
        license: dto.license ?? 'Proprietary',
        appType: (dto.appType as unknown as ApplicationType) ?? ApplicationType.DESKTOP,
        minHubVersion: dto.minHubVersion,
        dependencies: dto.dependencies as Prisma.InputJsonValue,
        status: (dto.status as unknown as ApplicationStatus) ?? ApplicationStatus.DRAFT,
        featured: dto.featured ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'APPLICATION_REGISTERED',
      entityType: 'Application',
      entityId: created.id,
      payload: { slug: created.slug, displayName: created.displayName },
    });

    if (created.status === ApplicationStatus.ACTIVE && this.catalogueService) {
      try {
        await this.catalogueService.publishRevision(
          `Auto-sync: Application '${created.displayName}' registered`,
          actor,
          ipAddress,
          userAgent,
        );
      } catch (e) {
        // Sync warning only
      }
    }

    return created;
  }

  async updateApplication(
    id: string,
    dto: UpdateApplicationDto,
    actor?: AuthenticatedUser,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const app = await this.prisma.application.findFirst({
      where: { id, deletedAt: null },
    });

    if (!app) {
      throw new NotFoundException(`Application with ID '${id}' not found.`);
    }

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.summary !== undefined && { summary: dto.summary }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.developer !== undefined && { developer: dto.developer }),
        ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
        ...(dto.bannerUrl !== undefined && { bannerUrl: dto.bannerUrl }),
        ...(dto.homepageUrl !== undefined && { homepageUrl: dto.homepageUrl }),
        ...(dto.docsUrl !== undefined && { docsUrl: dto.docsUrl }),
        ...(dto.webAppUrl !== undefined && { webAppUrl: dto.webAppUrl }),
        ...(dto.license !== undefined && { license: dto.license }),
        ...(dto.appType !== undefined && { appType: dto.appType as unknown as ApplicationType }),
        ...(dto.minHubVersion !== undefined && { minHubVersion: dto.minHubVersion }),
        ...(dto.dependencies !== undefined && {
          dependencies: dto.dependencies as Prisma.InputJsonValue,
        }),
        ...(dto.featured !== undefined && { featured: dto.featured }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'APPLICATION_UPDATED',
      entityType: 'Application',
      entityId: id,
      payload: { changes: dto },
    });

    if (this.catalogueService) {
      try {
        await this.catalogueService.publishRevision(
          `Auto-sync: Application '${updated.displayName}' updated`,
          actor,
          ipAddress,
          userAgent,
        );
      } catch (e) {}
    }

    return updated;
  }

  async updateStatus(
    id: string,
    status: ApplicationStatusEnum,
    actor?: AuthenticatedUser,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const app = await this.prisma.application.findFirst({
      where: { id, deletedAt: null },
    });

    if (!app) {
      throw new NotFoundException(`Application with ID '${id}' not found.`);
    }

    const updated = await this.prisma.application.update({
      where: { id },
      data: { status: status as unknown as ApplicationStatus },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'APPLICATION_STATUS_CHANGED',
      entityType: 'Application',
      entityId: id,
      payload: { previousStatus: app.status, newStatus: status },
    });

    if (this.catalogueService) {
      try {
        await this.catalogueService.publishRevision(
          `Auto-sync: Application '${app.displayName}' status set to ${status}`,
          actor,
          ipAddress,
          userAgent,
        );
      } catch (e) {}
    }

    return updated;
  }

  async archiveApplication(
    id: string,
    actor?: AuthenticatedUser,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const app = await this.prisma.application.findFirst({
      where: { id, deletedAt: null },
    });

    if (!app) {
      throw new NotFoundException(`Application with ID '${id}' not found.`);
    }

    const archived = await this.prisma.application.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        deletedAt: new Date(),
      },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'APPLICATION_ARCHIVED',
      entityType: 'Application',
      entityId: id,
      payload: { slug: app.slug },
    });

    if (this.catalogueService) {
      try {
        await this.catalogueService.publishRevision(
          `Auto-sync: Application '${app.displayName}' archived`,
          actor,
          ipAddress,
          userAgent,
        );
      } catch (e) {}
    }

    return archived;
  }

  async deleteApplication(
    id: string,
    actor?: AuthenticatedUser,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const app = await this.prisma.application.findFirst({
      where: { id },
    });

    if (!app) {
      throw new NotFoundException(`Application with ID '${id}' not found.`);
    }

    const deleted = await this.prisma.application.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        deletedAt: new Date(),
      },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'APPLICATION_DELETED',
      entityType: 'Application',
      entityId: id,
      payload: { slug: app.slug },
    });

    if (this.catalogueService) {
      try {
        await this.catalogueService.publishRevision(
          `Auto-sync: Application '${app.displayName}' deleted`,
          actor,
          ipAddress,
          userAgent,
        );
      } catch (e) {}
    }

    return deleted;
  }

  async getApplication(idOrSlug: string) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const app = await this.prisma.application.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        deletedAt: null,
      },
      include: {
        compatibilities: true,
        connections: true,
        releases: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: { channel: true },
        },
      },
    });

    if (!app) {
      throw new NotFoundException(`Application '${idOrSlug}' not found.`);
    }

    return sanitizeBigInt(app);
  }

  async listApplications(query: QueryApplicationsDto) {
    if (!this.prisma) {
      return { data: [], meta: { total: 0, page: 1, limit: 20 } };
    }

    const page = parseInt(query.page || '1', 10) || 1;
    const limit = parseInt(query.limit || '20', 10) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ApplicationWhereInput = {
      deletedAt: null,
    };

    if (query.category) {
      where.category = query.category;
    }

    if (query.status) {
      where.status = query.status as unknown as ApplicationStatus;
    }

    if (query.appType) {
      where.appType = query.appType as unknown as ApplicationType;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { slug: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.application.count({ where }),
      this.prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        include: {
          compatibilities: true,
          connections: { select: { id: true, repoOwner: true, repoName: true, isActive: true } },
        },
      }),
    ]);

    return {
      data,
      meta: { total, page, limit },
    };
  }

  async addPlatformCompatibility(
    applicationId: string,
    dto: PlatformCompatibilityDto,
    actor?: AuthenticatedUser,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, deletedAt: null },
    });

    if (!app) {
      throw new NotFoundException(`Application '${applicationId}' not found.`);
    }

    const compatibility = await this.prisma.platformCompatibility.upsert({
      where: {
        applicationId_os_arch_packageFormat: {
          applicationId,
          os: dto.os as unknown as OperatingSystem,
          arch: dto.arch as unknown as CpuArchitecture,
          packageFormat: dto.packageFormat as unknown as PackageFormat,
        },
      },
      update: {
        minOsVersion: dto.minOsVersion,
        maxOsVersion: dto.maxOsVersion,
        launchExecutableName: dto.launchExecutableName,
        installInstructions: dto.installInstructions,
        isSupported: dto.isSupported ?? true,
      },
      create: {
        applicationId,
        os: dto.os as unknown as OperatingSystem,
        arch: dto.arch as unknown as CpuArchitecture,
        packageFormat: dto.packageFormat as unknown as PackageFormat,
        minOsVersion: dto.minOsVersion,
        maxOsVersion: dto.maxOsVersion,
        launchExecutableName: dto.launchExecutableName,
        installInstructions: dto.installInstructions,
        isSupported: dto.isSupported ?? true,
      },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'PLATFORM_COMPATIBILITY_CONFIGURED',
      entityType: 'PlatformCompatibility',
      entityId: compatibility.id,
      payload: { applicationId, os: dto.os, arch: dto.arch, format: dto.packageFormat },
    });

    return compatibility;
  }

  async removePlatformCompatibility(
    applicationId: string,
    compatibilityId: string,
    actor?: AuthenticatedUser,
    ipAddress: string = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const deleted = await this.prisma.platformCompatibility.delete({
      where: { id: compatibilityId, applicationId },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'PLATFORM_COMPATIBILITY_REMOVED',
      entityType: 'PlatformCompatibility',
      entityId: compatibilityId,
      payload: { applicationId },
    });

    return deleted;
  }
}
