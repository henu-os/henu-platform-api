import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { PrismaService } from '@/prisma/prisma.service';
import {
  CatalogueManifestResponseDto,
  CatalogueApplicationDto,
} from './dto/catalogue-response.dto';
import { UpdateCheckQueryDto, UpdateCheckResponseDto } from './dto/update-check.dto';
import {
  CreateDesktopShortcutDto,
  DesktopShortcutResponseDto,
} from './dto/desktop-shortcut.dto';

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

  async createDesktopShortcut(dto: CreateDesktopShortcutDto): Promise<DesktopShortcutResponseDto> {
    if (os.platform() !== 'win32') {
      return { success: true, createdShortcuts: [], message: 'Shortcuts only managed on Windows' };
    }

    const home = os.homedir();
    const candidateDirs = [
      path.join(home, 'OneDrive', 'Desktop'),
      path.join(home, 'Desktop'),
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop') : null,
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Desktop') : null,
    ].filter((p): p is string => Boolean(p && fs.existsSync(p)));

    const desktopDirs = Array.from(new Set(candidateDirs));
    const createdShortcuts: string[] = [];
    const sanitizedName = dto.name.replace(/[\\/:*?"<>|]/g, '').trim();

    for (const dir of desktopDirs) {
      try {
        if (dto.isWebApp || dto.targetPath.startsWith('http://') || dto.targetPath.startsWith('https://')) {
          // 1. Create standard Windows .url file for web apps
          const urlFilePath = path.join(dir, `${sanitizedName}.url`);
          const urlContent = `[InternetShortcut]\r\nURL=${dto.targetPath}\r\nIconIndex=0\r\n`;
          fs.writeFileSync(urlFilePath, urlContent, 'utf8');
          createdShortcuts.push(urlFilePath);
        } else {
          // 2. Create native .lnk file for desktop executables
          const lnkFilePath = path.join(dir, `${sanitizedName}.lnk`);
          const workingDir = path.dirname(dto.targetPath);
          const psScript = `$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${lnkFilePath.replace(/'/g, "''")}'); $s.TargetPath = '${dto.targetPath.replace(/'/g, "''")}'; $s.WorkingDirectory = '${workingDir.replace(/'/g, "''")}'; $s.Save();`;
          spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
            windowsHide: true,
            timeout: 5000,
          });
          if (fs.existsSync(lnkFilePath)) {
            createdShortcuts.push(lnkFilePath);
          }
        }
      } catch (err) {
        console.error(`Failed to create desktop shortcut in ${dir}:`, err);
      }
    }

    return {
      success: createdShortcuts.length > 0,
      createdShortcuts,
      message: `Created ${createdShortcuts.length} desktop shortcut(s)`,
    };
  }

  async removeDesktopShortcut(name: string): Promise<{ success: boolean; removedShortcuts: string[] }> {
    if (os.platform() !== 'win32') {
      return { success: true, removedShortcuts: [] };
    }

    const home = os.homedir();
    const candidateDirs = [
      path.join(home, 'OneDrive', 'Desktop'),
      path.join(home, 'Desktop'),
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop') : null,
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Desktop') : null,
    ].filter((p): p is string => Boolean(p && fs.existsSync(p)));

    const desktopDirs = Array.from(new Set(candidateDirs));
    const removedShortcuts: string[] = [];
    const sanitizedName = name.replace(/[\\/:*?"<>|]/g, '').trim();

    for (const dir of desktopDirs) {
      for (const ext of ['.url', '.lnk']) {
        const filePath = path.join(dir, `${sanitizedName}${ext}`);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            removedShortcuts.push(filePath);
          } catch (err) {
            console.error(`Failed to remove desktop shortcut ${filePath}:`, err);
          }
        }
      }
    }

    return {
      success: true,
      removedShortcuts,
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
