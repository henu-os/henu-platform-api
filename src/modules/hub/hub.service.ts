import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  CatalogueManifestResponseDto,
  CatalogueApplicationDto,
} from './dto/catalogue-response.dto';
import { UpdateCheckQueryDto, UpdateCheckResponseDto } from './dto/update-check.dto';

@Injectable()
export class HubService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async getLatestCatalogue(): Promise<{
    manifest: CatalogueManifestResponseDto;
    contentHash: string;
  }> {
    if (!this.prisma) {
      return this.getFallbackManifest();
    }

    try {
      const activeRevision = await this.prisma.catalogueRevision.findFirst({
        where: { isActive: true },
        orderBy: { revisionNumber: 'desc' },
      });

      if (activeRevision && activeRevision.manifestPayload) {
        return {
          manifest: activeRevision.manifestPayload as unknown as CatalogueManifestResponseDto,
          contentHash: activeRevision.contentHash,
        };
      }
    } catch {
      // Fall through to fallback manifest if database is unseeded/unavailable
    }

    return this.getFallbackManifest();
  }

  async getApplicationBySlug(slug: string): Promise<CatalogueApplicationDto> {
    const { manifest } = await this.getLatestCatalogue();
    const app = manifest.applications.find((a) => a.slug === slug);

    if (!app) {
      throw new NotFoundException(`Application '${slug}' was not found in the public catalogue.`);
    }

    return app;
  }

  async checkForUpdates(query: UpdateCheckQueryDto): Promise<UpdateCheckResponseDto> {
    const { app: slug, channel, currentVersion, os, arch } = query;
    const app = await this.getApplicationBySlug(slug);

    const channelRelease = app.channels[channel];
    if (!channelRelease) {
      return {
        updateAvailable: false,
        appSlug: slug,
        channel,
        currentVersion,
        latestVersion: currentVersion,
      };
    }

    const hasUpdate = channelRelease.version !== currentVersion;
    if (!hasUpdate) {
      return {
        updateAvailable: false,
        appSlug: slug,
        channel,
        currentVersion,
        latestVersion: channelRelease.version,
      };
    }

    const matchedAsset = channelRelease.assets.find(
      (a) => a.os.toUpperCase() === os.toUpperCase() && a.arch.toUpperCase() === arch.toUpperCase(),
    );

    return {
      updateAvailable: true,
      appSlug: slug,
      channel,
      currentVersion,
      latestVersion: channelRelease.version,
      publishedAt: channelRelease.publishedAt,
      changelog: channelRelease.changelog,
      asset: matchedAsset
        ? {
            fileName: matchedAsset.fileName,
            downloadUrl: matchedAsset.downloadUrl,
            sizeBytes: matchedAsset.sizeBytes,
            sha256: matchedAsset.sha256,
            packageFormat: matchedAsset.packageFormat,
          }
        : undefined,
    };
  }

  private getFallbackManifest(): {
    manifest: CatalogueManifestResponseDto;
    contentHash: string;
  } {
    const fallback: CatalogueManifestResponseDto = {
      schemaVersion: '1.0.0',
      revision: 0,
      generatedAt: new Date().toISOString(),
      contentHash: '0000000000000000000000000000000000000000000000000000000000000000',
      channels: ['STABLE', 'BETA', 'NIGHTLY'],
      applications: [],
    };

    return {
      manifest: fallback,
      contentHash: fallback.contentHash,
    };
  }
}
