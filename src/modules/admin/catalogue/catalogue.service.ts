import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { RealtimeEventsService } from '@/common/realtime/realtime-events.service';
import { AuthenticatedUser } from '@/common/auth/decorators/current-user.decorator';
import { CatalogueSignerService } from '@/common/crypto/catalogue-signer.service';
import { computeContentHash } from '@/common/crypto/canonical-json';

interface CataloguePackage {
  os: string;
  arch: string;
  packageFormat: string;
  downloadUrl: string;
  sizeBytes: number;
  sha256: string;
  fileName: string;
}

interface CatalogueChannelRelease {
  channel: string;
  version: string;
  releaseDate: string;
  releaseNotes: string;
  releaseUrl: string;
  packages: CataloguePackage[];
}

interface CatalogueApplicationItem {
  id: string;
  name: string;
  summary: string;
  description: string;
  type: string;
  category: string;
  tags: string[];
  icon?: string | null;
  banner?: string | null;
  publisher: {
    name: string;
    website: string;
    verified: boolean;
  };
  repository: {
    provider: string;
    owner: string;
    name: string;
    url: string;
  };
  status: string;
  visibility: string;
  featured: boolean;
  channels: Record<string, CatalogueChannelRelease>;
}

@Injectable()
export class CatalogueManagementService {
  constructor(
    private readonly auditService: AuditService,
    private readonly realtimeEventsService: RealtimeEventsService,
    private readonly signerService: CatalogueSignerService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async listRevisions() {
    if (!this.prisma) return [];

    const revisions = await this.prisma.catalogueRevision.findMany({
      orderBy: { revisionNumber: 'desc' },
      include: {
        publishedBy: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });

    return revisions.map((r) => ({
      id: r.id,
      revisionNumber: r.revisionNumber,
      contentHash: r.contentHash,
      applicationCount: r.applicationCount,
      releaseCount: r.releaseCount,
      summary: r.summary,
      isActive: r.isActive,
      publishedAt: r.publishedAt.toISOString(),
      publishedBy: r.publishedBy,
    }));
  }

  async publishRevision(
    summary: string,
    actor?: AuthenticatedUser,
    ipAddress = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new BadRequestException('Database service is unavailable.');

    // 1. Gather all active applications and their published releases
    const applications = await this.prisma.application.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        releases: {
          where: { status: 'PUBLISHED' },
          orderBy: [{ semverMajor: 'desc' }, { semverMinor: 'desc' }, { semverPatch: 'desc' }],
          include: {
            channel: true,
            assets: {
              where: { verificationStatus: 'VERIFIED' },
              include: { platformCompatibility: true },
            },
          },
        },
      },
    });

    const lastRevision = await this.prisma.catalogueRevision.findFirst({
      orderBy: { revisionNumber: 'desc' },
    });
    const nextRevisionNumber = (lastRevision?.revisionNumber || 0) + 1;

    let appsPayload: CatalogueApplicationItem[] = [];

    if (applications.length > 0) {
      appsPayload = applications.map((app) => {
        const channelsMap: Record<string, CatalogueChannelRelease> = {};

        for (const rel of app.releases) {
          const chName = rel.channel.name.toLowerCase();
          if (!channelsMap[chName]) {
            channelsMap[chName] = {
              channel: chName,
              version: rel.version,
              releaseDate: rel.publishedAt?.toISOString() || new Date().toISOString(),
              releaseNotes: rel.changelog || `Release ${rel.version}`,
              releaseUrl: `https://github.com/henu-os/${app.slug}/releases/tag/v${rel.version}`,
              packages: rel.assets.map((a) => {
                const compat = a.platformCompatibility;
                return {
                  os: (compat?.os || 'windows').toLowerCase(),
                  arch: (compat?.arch || 'x86_64').toLowerCase(),
                  packageFormat: (compat?.packageFormat || 'exe').toLowerCase(),
                  downloadUrl: a.downloadUrl,
                  sizeBytes: Number(a.sizeBytes),
                  sha256: a.sha256,
                  fileName: a.fileName,
                };
              }),
            };
          }
        }

        return {
          id: app.slug,
          name: app.displayName,
          summary: app.summary,
          description: app.description,
          type: app.appType.toLowerCase(),
          category: app.category || 'Productivity',
          tags: [],
          icon: app.iconUrl,
          banner: app.bannerUrl,
          webAppUrl: app.webAppUrl || app.homepageUrl || (app.appType === 'WEB' ? 'https://www.henuos.in' : undefined),
          publisher: {
            name: app.developer || 'HENU OS PRIVATE LIMITED',
            website: app.homepageUrl || 'https://www.henuos.in/',
            verified: true,
          },
          repository: {
            provider: 'github',
            owner: 'henu-os',
            name: app.slug,
            url: `https://github.com/henu-os/${app.slug}`,
          },
          status: 'active',
          visibility: 'public',
          featured: app.featured,
          channels: channelsMap,
        };
      });
    }

    const manifestPayload = {
      $schema: 'https://schema.henuos.com/v1/henu-catalogue.schema.json',
      schemaVersion: '1.0.0',
      revision: nextRevisionNumber,
      generatedAt: new Date().toISOString(),
      publisher: {
        name: 'HENU OS PRIVATE LIMITED',
        url: 'https://www.henuos.in/',
        supportEmail: 'info@henuos.in',
      },
      catalogueSummary: {
        totalApplications: appsPayload.length,
        channels: ['stable', 'beta', 'nightly'],
      },
      applications: appsPayload,
    };

    // Compute cryptographic SHA-256 digest over normalized canonical applications array
    const contentHash = computeContentHash(appsPayload);

    // Cryptographically sign the catalogue revision contentHash with Ed25519
    const signatureInfo = this.signerService.sign(contentHash);

    const signedManifestPayload = {
      ...manifestPayload,
      contentHash,
      signature: signatureInfo,
    };

    const totalReleases = appsPayload.reduce(
      (acc, a) => acc + Object.keys(a.channels || {}).length,
      0,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.catalogueRevision.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      return tx.catalogueRevision.create({
        data: {
          revisionNumber: nextRevisionNumber,
          contentHash,
          manifestPayload: signedManifestPayload as unknown as object,
          signature: signatureInfo.value,
          signingKeyId: signatureInfo.keyId,
          signatureAlgorithm: signatureInfo.algorithm,
          applicationCount: appsPayload.length,
          releaseCount: totalReleases,
          summary: summary.trim(),
          isActive: true,
          publishedByAdminId: actor?.id,
        },
      });
    });

    const baseUrl = this.configService?.get<string>('apiBaseUrl') || 'https://henu-platform-api.onrender.com';
    const apiPrefix = this.configService?.get<string>('apiPrefix') || 'api/v1';
    const catalogueUrl = `${baseUrl.replace(/\/+$/, '')}/${apiPrefix.replace(/^\/+/, '')}/hub/catalogue`;

    // Broadcast durable real-time event to all connected desktop Hubs & Admin consoles
    await this.realtimeEventsService.emitCatalogueUpdated({
      revision: created.revisionNumber,
      contentHash: created.contentHash,
      catalogueUrl,
      publishedAt: created.publishedAt.toISOString(),
      summary: created.summary,
      totalApplications: created.applicationCount,
      signature: signatureInfo,
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'admin@henuos.com',
      ipAddress,
      userAgent,
      action: 'CATALOGUE_PUBLISHED',
      entityType: 'CatalogueRevision',
      entityId: created.id,
      payload: {
        revisionNumber: created.revisionNumber,
        contentHash: created.contentHash,
        summary: created.summary,
        keyId: signatureInfo.keyId,
      },
    });

    return {
      id: created.id,
      revisionNumber: created.revisionNumber,
      contentHash: created.contentHash,
      signature: signatureInfo,
      applicationCount: created.applicationCount,
      releaseCount: created.releaseCount,
      summary: created.summary,
      isActive: created.isActive,
      publishedAt: created.publishedAt.toISOString(),
    };
  }

  async rollbackCatalogue(
    targetRevisionNumber: number,
    actor?: AuthenticatedUser,
    ipAddress = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new BadRequestException('Database unavailable.');

    const target = await this.prisma.catalogueRevision.findUnique({
      where: { revisionNumber: targetRevisionNumber },
    });

    if (!target) {
      throw new NotFoundException(`Catalogue Revision #${targetRevisionNumber} was not found.`);
    }

    const lastRevision = await this.prisma.catalogueRevision.findFirst({
      orderBy: { revisionNumber: 'desc' },
    });
    const nextRevisionNumber = (lastRevision?.revisionNumber || 0) + 1;

    // Rollback is always executed as a NEW forward revision (preserving immutability)
    const targetPayload = target.manifestPayload as any;
    const manifestPayload = {
      ...targetPayload,
      revision: nextRevisionNumber,
      generatedAt: new Date().toISOString(),
    };
    delete manifestPayload.signature;

    // Compute cryptographic SHA-256 digest over normalized canonical applications array
    const targetApps = targetPayload.applications || [];
    const contentHash = computeContentHash(targetApps);

    const signatureInfo = this.signerService.sign(contentHash);

    const signedManifestPayload = {
      ...manifestPayload,
      contentHash,
      signature: signatureInfo,
    };

    const rollbackSummary = `Rollback to Revision #${targetRevisionNumber} content`;

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.catalogueRevision.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      return tx.catalogueRevision.create({
        data: {
          revisionNumber: nextRevisionNumber,
          contentHash,
          manifestPayload: signedManifestPayload as unknown as object,
          signature: signatureInfo.value,
          signingKeyId: signatureInfo.keyId,
          signatureAlgorithm: signatureInfo.algorithm,
          applicationCount: target.applicationCount,
          releaseCount: target.releaseCount,
          summary: rollbackSummary,
          isActive: true,
          publishedByAdminId: actor?.id,
        },
      });
    });

    // Real-time broadcast rollback through standard event
    await this.realtimeEventsService.emitCatalogueUpdated({
      revision: created.revisionNumber,
      contentHash: created.contentHash,
      catalogueUrl: 'http://localhost:3000/api/v1/hub/catalogue',
      publishedAt: created.publishedAt.toISOString(),
      summary: rollbackSummary,
      totalApplications: created.applicationCount,
      signature: signatureInfo,
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'admin@henuos.com',
      ipAddress,
      userAgent,
      action: 'CATALOGUE_ROLLEDBACK',
      entityType: 'CatalogueRevision',
      entityId: created.id,
      payload: { targetRevisionNumber, newRevisionNumber: created.revisionNumber },
    });

    return {
      success: true,
      revision: created.revisionNumber,
      rolledBackFrom: targetRevisionNumber,
      contentHash: created.contentHash,
      signature: signatureInfo,
    };
  }
}
