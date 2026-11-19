import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import * as crypto from 'crypto';
import { Readable } from 'stream';

export interface GitHubRateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  used: number;
}

export interface CachedInstallationToken {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class GitHubAppService {
  private readonly logger = new Logger(GitHubAppService.name);
  private readonly tokenCache = new Map<number, CachedInstallationToken>();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Constructs an Octokit instance authenticated as the GitHub App itself (using private RSA key JWT).
   */
  getAppOctokit(): Octokit {
    const appId = this.configService.get<string>('github.appId');
    const privateKeyBase64 = this.configService.get<string>('github.privateKeyBase64');
    const clientId = this.configService.get<string>('github.clientId');

    if (!appId || !privateKeyBase64) {
      throw new UnauthorizedException(
        'GitHub App credentials (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_BASE64) are not configured.',
      );
    }

    const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');

    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
        clientId,
      },
    });
  }

  /**
   * Generates or retrieves a cached installation access token for a target repository installation.
   */
  async getInstallationToken(installationId: number): Promise<string> {
    const cached = this.tokenCache.get(installationId);
    const now = new Date();

    // Re-use token if it is valid for at least another 5 minutes
    if (cached && cached.expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
      return cached.token;
    }

    const appId = this.configService.get<string>('github.appId');
    const privateKeyBase64 = this.configService.get<string>('github.privateKeyBase64');
    const clientId = this.configService.get<string>('github.clientId');

    if (!appId || !privateKeyBase64) {
      throw new UnauthorizedException('GitHub App credentials missing.');
    }

    const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');

    const auth = createAppAuth({
      appId,
      privateKey,
      clientId,
    });

    const installationAuth = await auth({
      type: 'installation',
      installationId,
    });

    const token = installationAuth.token;
    const expiresAt = new Date(installationAuth.expiresAt);

    this.tokenCache.set(installationId, { token, expiresAt });
    this.logger.log(
      `Generated fresh GitHub installation token for installation ID: ${installationId}`,
    );

    return token;
  }

  /**
   * Creates an Octokit instance authenticated with an installation token.
   */
  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    const token = await this.getInstallationToken(installationId);
    return new Octokit({ auth: token });
  }

  /**
   * Validates whether the GitHub App installation has access to a specific repository.
   */
  async validateRepositoryAccess(
    installationId: number,
    owner: string,
    repo: string,
  ): Promise<{
    accessible: boolean;
    permissions?: Record<string, boolean>;
    defaultBranch?: string;
  }> {
    try {
      const octokit = await this.getInstallationOctokit(installationId);
      const { data: repoData } = await octokit.rest.repos.get({
        owner,
        repo,
      });

      return {
        accessible: true,
        permissions: repoData.permissions,
        defaultBranch: repoData.default_branch,
      };
    } catch (error) {
      this.logger.warn(
        `Repository access check failed for ${owner}/${repo} under installation ${installationId}: ${(error as Error).message}`,
      );
      return { accessible: false };
    }
  }

  /**
   * Checks current GitHub rate limits for the installation.
   */
  async getRateLimit(installationId: number): Promise<GitHubRateLimitInfo> {
    const octokit = await this.getInstallationOctokit(installationId);
    const { data } = await octokit.rest.rateLimit.get();

    return {
      limit: data.rate.limit,
      remaining: data.rate.remaining,
      reset: new Date(data.rate.reset * 1000),
      used: data.rate.used,
    };
  }

  /**
   * Retrieves full release metadata from GitHub.
   */
  async fetchRelease(installationId: number, owner: string, repo: string, releaseId: number) {
    const octokit = await this.getInstallationOctokit(installationId);
    const { data: release } = await octokit.rest.repos.getRelease({
      owner,
      repo,
      release_id: releaseId,
    });

    return release;
  }

  /**
   * Streams a binary release asset directly from GitHub to compute its cryptographic SHA-256 digest
   * without executing or persisting executable binaries on the API server.
   */
  async streamAssetAndCalculateSha256(
    installationId: number,
    owner: string,
    repo: string,
    assetId: number,
  ): Promise<{ sha256: string; byteLength: number }> {
    const octokit = await this.getInstallationOctokit(installationId);

    // Request asset binary stream with application/octet-stream header
    const response = await octokit.rest.repos.getReleaseAsset({
      owner,
      repo,
      asset_id: assetId,
      headers: {
        accept: 'application/octet-stream',
      },
    });

    const hash = crypto.createHash('sha256');
    let byteLength = 0;

    // Handle Buffer response (Node Octokit) or Stream response
    if (Buffer.isBuffer(response.data)) {
      byteLength = response.data.length;
      hash.update(response.data);
    } else if (response.data instanceof ArrayBuffer) {
      const buffer = Buffer.from(response.data);
      byteLength = buffer.length;
      hash.update(buffer);
    } else if (response.data && typeof (response.data as unknown as Readable).on === 'function') {
      const stream = response.data as unknown as Readable;
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          byteLength += chunk.length;
          hash.update(chunk);
        });
        stream.on('end', resolve);
        stream.on('error', reject);
      });
    } else {
      // Fallback for string / array data
      const buffer = Buffer.from(response.data as unknown as string);
      byteLength = buffer.length;
      hash.update(buffer);
    }

    const sha256 = hash.digest('hex');
    this.logger.log(`Calculated SHA-256 for asset ID ${assetId} (${byteLength} bytes): ${sha256}`);

    return { sha256, byteLength };
  }
}
