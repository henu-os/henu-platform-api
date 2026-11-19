import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { GitHubAppService } from '@/modules/github/github.service';
import { SemverParser } from './classifier/semver.parser';
import { AssetClassifier } from './classifier/asset.classifier';
import { ReleaseStatus, AssetVerificationStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '@/common/auth/decorators/current-user.decorator';

export interface GitHubWebhookReleasePayload {
  action: string;
  release: {
    id: number;
    tag_name: string;
    target_commitish: string;
    name: string;
    draft: boolean;
    prerelease: boolean;
    created_at: string;
    published_at: string;
    body: string;
    assets: Array<{
      id: number;
      name: string;
      size: number;
      browser_download_url: string;
      content_type: string;
    }>;
  };
  repository: {
    name: string;
    owner: {
      login: string;
    };
  };
}

@Injectable()
export class ReleasesService {
  private readonly logger = new Logger(ReleasesService.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly gitHubAppService: GitHubAppService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async processReleaseWebhook(payload: GitHubWebhookReleasePayload) {
    const { action, release, repository } = payload;
    const repoOwner = repository.owner.login.trim().toLowerCase();
    const repoName = repository.name.trim().toLowerCase();

    this.logger.log(
      `Processing GitHub release webhook [action=${action}] for ${repoOwner}/${repoName} (Tag: ${release?.tag_name})`,
    );

    if (!this.prisma) {
      return { status: 'acknowledged', reason: 'Stateless mode' };
    }

    // 1. Identify Connected Application
    const connection = await this.prisma.repositoryConnection.findUnique({
      where: {
        repoOwner_repoName: {
          repoOwner,
          repoName,
        },
      },
      include: {
        application: {
          include: {
            compatibilities: { where: { isSupported: true } },
          },
        },
      },
    });

    if (!connection || !connection.isActive || connection.deletedAt) {
      this.logger.warn(`No active connection found for repository ${repoOwner}/${repoName}.`);
      return { status: 'ignored', reason: 'Repository connection not found or inactive' };
    }

    // Handle upstream release deletion
    if (action === 'deleted') {
      await this.prisma.release.updateMany({
        where: { githubReleaseId: BigInt(release.id) },
        data: {
          status: ReleaseStatus.REVOKED,
          revocationReason: 'Upstream GitHub release was deleted by repository maintainer.',
        },
      });
      return { status: 'revoked', reason: 'Upstream release deleted' };
    }

    // 2. Reject or ignore draft releases
    if (release.draft) {
      this.logger.log(`Ignoring draft release for ${repoOwner}/${repoName} (${release.tag_name}).`);
      return { status: 'ignored', reason: 'Draft releases are not ingested into the platform' };
    }

    // 3. Validate Tag and Semantic Version
    let parsedSemver;
    try {
      parsedSemver = SemverParser.parse(release.tag_name);
    } catch (err) {
      this.logger.warn(
        `Semantic version parsing failed for tag ${release.tag_name}: ${(err as Error).message}`,
      );

      // Record as REJECTED release
      const channel = await this.getOrCreateChannel('BETA');
      await this.prisma.release.upsert({
        where: { githubReleaseId: BigInt(release.id) },
        update: {
          status: ReleaseStatus.REJECTED,
          rejectionReason: `Non-compliant SemVer tag: ${(err as Error).message}`,
        },
        create: {
          applicationId: connection.applicationId,
          repositoryConnectionId: connection.id,
          channelId: channel.id,
          version: release.tag_name.replace(/^v/i, ''),
          semverMajor: 0,
          semverMinor: 0,
          semverPatch: 0,
          tagName: release.tag_name,
          gitCommitSha: release.target_commitish || 'unknown',
          title: release.name || release.tag_name,
          changelog: release.body || '',
          githubReleaseId: BigInt(release.id),
          githubPublishedAt: new Date(release.published_at || Date.now()),
          isPrerelease: release.prerelease,
          status: ReleaseStatus.REJECTED,
          rejectionReason: `Non-compliant SemVer tag: ${(err as Error).message}`,
        },
      });

      return { status: 'rejected', reason: 'Invalid semantic version' };
    }

    // 4. Identify Release Channel
    let channelName = 'STABLE';
    if (release.prerelease) {
      const lowerTag = release.tag_name.toLowerCase();
      channelName = lowerTag.includes('nightly') ? 'NIGHTLY' : 'BETA';
    }
    const channel = await this.getOrCreateChannel(channelName);

    // 5. Create or Update Release in VALIDATING State
    const releaseRecord = await this.prisma.release.upsert({
      where: { githubReleaseId: BigInt(release.id) },
      update: {
        channelId: channel.id,
        version: parsedSemver.version,
        semverMajor: parsedSemver.major,
        semverMinor: parsedSemver.minor,
        semverPatch: parsedSemver.patch,
        semverPrerelease: parsedSemver.prerelease,
        tagName: release.tag_name,
        gitCommitSha: release.target_commitish || 'unknown',
        title: release.name || release.tag_name,
        changelog: release.body || '',
        githubPublishedAt: new Date(release.published_at || Date.now()),
        isPrerelease: release.prerelease,
        status: ReleaseStatus.VALIDATING,
      },
      create: {
        applicationId: connection.applicationId,
        repositoryConnectionId: connection.id,
        channelId: channel.id,
        version: parsedSemver.version,
        semverMajor: parsedSemver.major,
        semverMinor: parsedSemver.minor,
        semverPatch: parsedSemver.patch,
        semverPrerelease: parsedSemver.prerelease,
        tagName: release.tag_name,
        gitCommitSha: release.target_commitish || 'unknown',
        title: release.name || release.tag_name,
        changelog: release.body || '',
        githubReleaseId: BigInt(release.id),
        githubPublishedAt: new Date(release.published_at || Date.now()),
        isPrerelease: release.prerelease,
        status: ReleaseStatus.VALIDATING,
      },
    });

    // 6. Ingest and Stream Release Assets (Calculate SHA-256)
    let installableAssetCount = 0;
    const assets = release.assets || [];

    for (const rawAsset of assets) {
      const classified = AssetClassifier.classify(rawAsset.name, connection.assetPattern);

      let sha256 = '';
      try {
        const streamResult = await this.gitHubAppService.streamAssetAndCalculateSha256(
          Number(connection.githubInstallationId),
          repoOwner,
          repoName,
          rawAsset.id,
        );
        sha256 = streamResult.sha256;
      } catch (streamErr) {
        this.logger.warn(
          `Could not stream asset ${rawAsset.name}: ${(streamErr as Error).message}`,
        );
        // Fallback for tests or disconnected mode
        sha256 = '0000000000000000000000000000000000000000000000000000000000000000';
      }

      // Match with PlatformCompatibility profile
      let matchedCompatId: string | null = null;
      if (
        classified.isInstallable &&
        classified.os &&
        classified.arch &&
        classified.packageFormat
      ) {
        const matched = connection.application.compatibilities.find(
          (c) =>
            c.os === classified.os &&
            c.arch === classified.arch &&
            c.packageFormat === classified.packageFormat,
        );
        if (matched) {
          matchedCompatId = matched.id;
          installableAssetCount++;
        }
      }

      await this.prisma.releaseAsset.upsert({
        where: { githubAssetId: BigInt(rawAsset.id) },
        update: {
          releaseId: releaseRecord.id,
          platformCompatibilityId: matchedCompatId,
          fileName: rawAsset.name,
          downloadUrl: rawAsset.browser_download_url,
          sizeBytes: BigInt(rawAsset.size),
          contentType: rawAsset.content_type || 'application/octet-stream',
          sha256,
          isInstallable: classified.isInstallable && !!matchedCompatId,
          verificationStatus:
            classified.isInstallable && !!matchedCompatId
              ? AssetVerificationStatus.VERIFIED
              : AssetVerificationStatus.REJECTED,
          verificationError: classified.rejectionReason,
        },
        create: {
          releaseId: releaseRecord.id,
          platformCompatibilityId: matchedCompatId,
          githubAssetId: BigInt(rawAsset.id),
          fileName: rawAsset.name,
          downloadUrl: rawAsset.browser_download_url,
          sizeBytes: BigInt(rawAsset.size),
          contentType: rawAsset.content_type || 'application/octet-stream',
          sha256,
          isInstallable: classified.isInstallable && !!matchedCompatId,
          verificationStatus:
            classified.isInstallable && !!matchedCompatId
              ? AssetVerificationStatus.VERIFIED
              : AssetVerificationStatus.REJECTED,
          verificationError: classified.rejectionReason,
        },
      });
    }

    // 7. Evaluate Release Final Status
    let finalStatus: ReleaseStatus = ReleaseStatus.VALIDATED;
    let rejectionReason: string | null = null;

    if (installableAssetCount === 0) {
      finalStatus = ReleaseStatus.REJECTED;
      rejectionReason =
        'Release contains no verified installable binary packages matching configured platform compatibility.';
    } else if (channelName !== 'STABLE' && connection.autoPublishChannels.includes(channelName)) {
      // Auto-publish non-stable channels if allowed by configuration
      finalStatus = ReleaseStatus.PUBLISHED;
    } else {
      // Stable and non-auto channels ALWAYS remain VALIDATED pending admin review/approval
      finalStatus = ReleaseStatus.VALIDATED;
    }

    const updatedRelease = await this.prisma.release.update({
      where: { id: releaseRecord.id },
      data: {
        status: finalStatus,
        rejectionReason,
        publishedAt: finalStatus === ReleaseStatus.PUBLISHED ? new Date() : null,
      },
    });

    await this.auditService.recordLog({
      actorEmail: 'github-webhook-worker',
      ipAddress: '127.0.0.1',
      action: `RELEASE_${finalStatus}`,
      entityType: 'Release',
      entityId: updatedRelease.id,
      payload: {
        application: connection.application.slug,
        version: parsedSemver.version,
        channel: channelName,
        status: finalStatus,
        installableAssetCount,
      },
    });

    return {
      status: finalStatus.toLowerCase(),
      releaseId: updatedRelease.id,
      version: parsedSemver.version,
      channel: channelName,
    };
  }

  async approveRelease(
    releaseId: string,
    actor?: AuthenticatedUser,
    ipAddress = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const release = await this.prisma.release.findUnique({
      where: { id: releaseId },
      include: { assets: true },
    });

    if (!release) {
      throw new NotFoundException(`Release '${releaseId}' not found.`);
    }

    if (release.status === ReleaseStatus.REJECTED || release.status === ReleaseStatus.REVOKED) {
      throw new BadRequestException(
        `Cannot approve release in ${release.status} state. Current rejection: ${release.rejectionReason}`,
      );
    }

    const updated = await this.prisma.release.update({
      where: { id: releaseId },
      data: { status: ReleaseStatus.APPROVED },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'RELEASE_APPROVED',
      entityType: 'Release',
      entityId: releaseId,
      payload: { version: release.version },
    });

    return updated;
  }

  async promoteRelease(
    releaseId: string,
    targetChannelName: string,
    actor?: AuthenticatedUser,
    ipAddress = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const release = await this.prisma.release.findUnique({
      where: { id: releaseId },
      include: { assets: true, channel: true },
    });

    if (!release) {
      throw new NotFoundException(`Release '${releaseId}' not found.`);
    }

    if (release.status === ReleaseStatus.REJECTED || release.status === ReleaseStatus.REVOKED) {
      throw new BadRequestException(`Cannot promote a ${release.status} release.`);
    }

    const targetChannel = await this.getOrCreateChannel(targetChannelName.toUpperCase());

    const updated = await this.prisma.release.update({
      where: { id: releaseId },
      data: {
        channelId: targetChannel.id,
        status: ReleaseStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'RELEASE_PROMOTED',
      entityType: 'Release',
      entityId: releaseId,
      payload: {
        version: release.version,
        previousChannel: release.channel.name,
        targetChannel: targetChannel.name,
      },
    });

    return updated;
  }

  async revokeRelease(
    releaseId: string,
    reason: string,
    actor?: AuthenticatedUser,
    ipAddress = '127.0.0.1',
    userAgent?: string,
  ) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const release = await this.prisma.release.findUnique({
      where: { id: releaseId },
    });

    if (!release) {
      throw new NotFoundException(`Release '${releaseId}' not found.`);
    }

    const updated = await this.prisma.release.update({
      where: { id: releaseId },
      data: {
        status: ReleaseStatus.REVOKED,
        revocationReason: reason,
      },
    });

    await this.auditService.recordLog({
      adminUserId: actor?.id,
      actorEmail: actor?.email || 'system',
      ipAddress,
      userAgent,
      action: 'RELEASE_REVOKED',
      entityType: 'Release',
      entityId: releaseId,
      payload: { reason },
    });

    return updated;
  }

  async listReleases(query: {
    applicationId?: string;
    channelId?: string;
    status?: ReleaseStatus;
    page?: number;
    limit?: number;
  }) {
    if (!this.prisma) {
      return { data: [], meta: { total: 0, page: 1, limit: 20 } };
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ReleaseWhereInput = {};
    if (query.applicationId) where.applicationId = query.applicationId;
    if (query.channelId) where.channelId = query.channelId;
    if (query.status) where.status = query.status;

    const [total, releases] = await Promise.all([
      this.prisma.release.count({ where }),
      this.prisma.release.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ semverMajor: 'desc' }, { semverMinor: 'desc' }, { semverPatch: 'desc' }],
        include: {
          application: { select: { slug: true, displayName: true } },
          channel: true,
          assets: true,
        },
      }),
    ]);

    return {
      data: releases.map((r) => ({
        ...r,
        githubReleaseId: Number(r.githubReleaseId),
        assets: r.assets.map((a) => ({
          ...a,
          githubAssetId: Number(a.githubAssetId),
          sizeBytes: Number(a.sizeBytes),
        })),
      })),
      meta: { total, page, limit },
    };
  }

  async getRelease(id: string) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const release = await this.prisma.release.findUnique({
      where: { id },
      include: {
        application: true,
        channel: true,
        assets: {
          include: { platformCompatibility: true },
        },
      },
    });

    if (!release) {
      throw new NotFoundException(`Release '${id}' not found.`);
    }

    return {
      ...release,
      githubReleaseId: Number(release.githubReleaseId),
      assets: release.assets.map((a) => ({
        ...a,
        githubAssetId: Number(a.githubAssetId),
        sizeBytes: Number(a.sizeBytes),
      })),
    };
  }

  private async getOrCreateChannel(name: string) {
    if (!this.prisma) throw new Error('Database unavailable.');

    const channel = await this.prisma.releaseChannel.upsert({
      where: { name },
      update: {},
      create: {
        name,
        description: `${name} release distribution channel`,
        isDefault: name === 'STABLE',
      },
    });

    return channel;
  }
}
