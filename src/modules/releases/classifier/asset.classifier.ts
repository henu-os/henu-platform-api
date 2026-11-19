import { OperatingSystem, CpuArchitecture, PackageFormat } from '@prisma/client';

export interface ClassifiedAsset {
  fileName: string;
  isInstallable: boolean;
  os?: OperatingSystem;
  arch?: CpuArchitecture;
  packageFormat?: PackageFormat;
  isSignatureFile: boolean;
  isChecksumFile: boolean;
  rejectionReason?: string;
}

export class AssetClassifier {
  /**
   * Classifies a release asset by inspecting its filename, extensions, and architecture indicators.
   */
  static classify(fileName: string, assetPattern?: string): ClassifiedAsset {
    const lowerName = fileName.toLowerCase();

    // 1. Identify Checksum & Signature Companion Files
    const isChecksumFile =
      lowerName.endsWith('.sha256') ||
      lowerName.endsWith('.sha512') ||
      lowerName === 'sha256sums.txt' ||
      lowerName === 'checksums.txt';

    const isSignatureFile =
      lowerName.endsWith('.sig') ||
      lowerName.endsWith('.asc') ||
      lowerName.endsWith('.minisig') ||
      lowerName.endsWith('.pem') ||
      lowerName.endsWith('.attestation') ||
      lowerName.endsWith('.provenance');

    if (isChecksumFile || isSignatureFile) {
      return {
        fileName,
        isInstallable: false,
        isChecksumFile,
        isSignatureFile,
        rejectionReason: isChecksumFile
          ? 'Checksum or manifest companion file.'
          : 'Cryptographic signature companion file.',
      };
    }

    // 2. Reject GitHub Automatic Source Code Archives & generic source archives
    if (
      lowerName.startsWith('source code') ||
      lowerName.match(/^v?[0-9].*\.(zip|tar\.gz)$/) ||
      lowerName.endsWith('-src.zip') ||
      lowerName.endsWith('-src.tar.gz') ||
      lowerName.endsWith('.tar.gz') ||
      lowerName.includes('source')
    ) {
      return {
        fileName,
        isInstallable: false,
        isChecksumFile: false,
        isSignatureFile: false,
        rejectionReason:
          'Source code archives (.tar.gz, .zip) are not installable application binary packages.',
      };
    }

    // 3. Match Configured Asset Pattern Regex
    if (assetPattern) {
      try {
        const regex = new RegExp(assetPattern, 'i');
        if (!regex.test(fileName)) {
          return {
            fileName,
            isInstallable: false,
            isChecksumFile: false,
            isSignatureFile: false,
            rejectionReason: `Asset filename does not match application asset pattern '${assetPattern}'.`,
          };
        }
      } catch (err) {
        // Fall through if pattern regex is malformed
      }
    }

    // 4. Identify Package Format
    const packageFormat = this.detectPackageFormat(lowerName);
    if (!packageFormat) {
      return {
        fileName,
        isInstallable: false,
        isChecksumFile: false,
        isSignatureFile: false,
        rejectionReason: 'Unsupported package extension/format.',
      };
    }

    // 5. Detect Operating System
    const os = this.detectOperatingSystem(lowerName, packageFormat);

    // 6. Detect Architecture
    const arch = this.detectArchitecture(lowerName, os);

    return {
      fileName,
      isInstallable: true,
      os,
      arch,
      packageFormat,
      isChecksumFile: false,
      isSignatureFile: false,
    };
  }

  private static detectPackageFormat(lowerName: string): PackageFormat | undefined {
    if (lowerName.endsWith('.exe')) return PackageFormat.EXE;
    if (lowerName.endsWith('.msi')) return PackageFormat.MSI;
    if (lowerName.endsWith('.dmg')) return PackageFormat.DMG;
    if (lowerName.endsWith('.pkg')) return PackageFormat.PKG;
    if (lowerName.endsWith('.appimage')) return PackageFormat.APPIMAGE;
    if (lowerName.endsWith('.deb')) return PackageFormat.DEB;
    if (lowerName.endsWith('.rpm')) return PackageFormat.RPM;
    if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz')) return PackageFormat.TAR_GZ;
    if (lowerName.endsWith('.zip')) return PackageFormat.ZIP;
    return undefined;
  }

  private static detectOperatingSystem(lowerName: string, format: PackageFormat): OperatingSystem {
    // Windows formats
    if (format === PackageFormat.EXE || format === PackageFormat.MSI) {
      return OperatingSystem.WINDOWS;
    }
    // macOS formats
    if (format === PackageFormat.DMG || format === PackageFormat.PKG) {
      return OperatingSystem.MACOS;
    }
    // Linux formats
    if (
      format === PackageFormat.APPIMAGE ||
      format === PackageFormat.DEB ||
      format === PackageFormat.RPM
    ) {
      return OperatingSystem.LINUX;
    }

    // For TAR_GZ and ZIP: inspect name tokens
    if (lowerName.includes('win') || lowerName.includes('windows')) {
      return OperatingSystem.WINDOWS;
    }
    if (lowerName.includes('mac') || lowerName.includes('darwin') || lowerName.includes('osx')) {
      return OperatingSystem.MACOS;
    }
    return OperatingSystem.LINUX;
  }

  private static detectArchitecture(lowerName: string, _os: OperatingSystem): CpuArchitecture {
    if (
      lowerName.includes('arm64') ||
      lowerName.includes('aarch64') ||
      lowerName.includes('m1') ||
      lowerName.includes('m2') ||
      lowerName.includes('m3')
    ) {
      return CpuArchitecture.ARM64;
    }

    if (
      lowerName.includes('universal') ||
      lowerName.includes('noarch') ||
      lowerName.includes('all')
    ) {
      return CpuArchitecture.UNIVERSAL;
    }

    // Default to X86_64 for standard desktop distributions
    return CpuArchitecture.X86_64;
  }
}
