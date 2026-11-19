export interface ParsedSemver {
  version: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  buildMetadata: string | null;
  isPrerelease: boolean;
}

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export class SemverParser {
  /**
   * Validates and parses a git tag or version string according to Semantic Versioning 2.0.0.
   */
  static parse(rawTag: string): ParsedSemver {
    if (!rawTag || typeof rawTag !== 'string') {
      throw new Error('Version tag must be a non-empty string.');
    }

    const cleanTag = rawTag.trim().replace(/^v/i, '');
    const match = cleanTag.match(SEMVER_REGEX);

    if (!match) {
      throw new Error(
        `Invalid Semantic Version tag '${rawTag}'. Tag must conform to SemVer 2.0.0 (e.g., v1.0.0, 2.1.3-beta.1).`,
      );
    }

    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const patch = parseInt(match[3], 10);
    const prerelease = match[4] || null;
    const buildMetadata = match[5] || null;

    return {
      version: cleanTag,
      major,
      minor,
      patch,
      prerelease,
      buildMetadata,
      isPrerelease: !!prerelease,
    };
  }

  /**
   * Safely checks whether a version tag satisfies SemVer 2.0.0.
   */
  static isValid(rawTag: string): boolean {
    try {
      this.parse(rawTag);
      return true;
    } catch {
      return false;
    }
  }
}
