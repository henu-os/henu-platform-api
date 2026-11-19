import { SemverParser } from './semver.parser';
import { AssetClassifier } from './asset.classifier';
import { OperatingSystem, CpuArchitecture, PackageFormat } from '@prisma/client';

describe('Release Classifiers', () => {
  describe('SemverParser', () => {
    it('should parse valid standard semver versions', () => {
      const res = SemverParser.parse('1.2.3');
      expect(res.major).toBe(1);
      expect(res.minor).toBe(2);
      expect(res.patch).toBe(3);
      expect(res.prerelease).toBeNull();
      expect(res.version).toBe('1.2.3');
    });

    it('should parse v-prefixed versions', () => {
      const res = SemverParser.parse('v2.0.4');
      expect(res.major).toBe(2);
      expect(res.minor).toBe(0);
      expect(res.patch).toBe(4);
      expect(res.version).toBe('2.0.4');
    });

    it('should parse prerelease versions', () => {
      const res = SemverParser.parse('v1.0.0-beta.1');
      expect(res.major).toBe(1);
      expect(res.minor).toBe(0);
      expect(res.patch).toBe(0);
      expect(res.prerelease).toBe('beta.1');
      expect(res.version).toBe('1.0.0-beta.1');
    });

    it('should reject invalid version tags', () => {
      expect(() => SemverParser.parse('invalid-tag')).toThrow('Tag must conform to SemVer 2.0.0');
      expect(() => SemverParser.parse('1.0')).toThrow();
      expect(() => SemverParser.parse('')).toThrow();
    });
  });

  describe('AssetClassifier', () => {
    const pattern =
      '^henu-(.+)-(windows|macos|linux)-(x64|arm64|universal)\\.(exe|msi|dmg|pkg|deb|rpm|appimage)$';

    it('should classify valid Windows installer asset', () => {
      const asset = AssetClassifier.classify('henu-pa-windows-x64.exe', pattern);
      expect(asset.isInstallable).toBe(true);
      expect(asset.os).toBe(OperatingSystem.WINDOWS);
      expect(asset.arch).toBe(CpuArchitecture.X86_64);
      expect(asset.packageFormat).toBe(PackageFormat.EXE);
      expect(asset.rejectionReason).toBeUndefined();
    });

    it('should classify valid macOS ARM64 dmg asset', () => {
      const asset = AssetClassifier.classify('henu-pa-macos-arm64.dmg', pattern);
      expect(asset.isInstallable).toBe(true);
      expect(asset.os).toBe(OperatingSystem.MACOS);
      expect(asset.arch).toBe(CpuArchitecture.ARM64);
      expect(asset.packageFormat).toBe(PackageFormat.DMG);
      expect(asset.rejectionReason).toBeUndefined();
    });

    it('should classify valid Linux AppImage asset', () => {
      const asset = AssetClassifier.classify('henu-pa-linux-x64.appimage', pattern);
      expect(asset.isInstallable).toBe(true);
      expect(asset.os).toBe(OperatingSystem.LINUX);
      expect(asset.arch).toBe(CpuArchitecture.X86_64);
      expect(asset.packageFormat).toBe(PackageFormat.APPIMAGE);
      expect(asset.rejectionReason).toBeUndefined();
    });

    it('should strictly reject source code archives from being treated as installable packages', () => {
      const tarGz = AssetClassifier.classify('henu-pa-1.0.0.tar.gz', pattern);
      expect(tarGz.isInstallable).toBe(false);
      expect(tarGz.rejectionReason).toContain('Source code archives (.tar.gz, .zip)');

      const zip = AssetClassifier.classify('source-code-v1.0.0.zip', pattern);
      expect(zip.isInstallable).toBe(false);
      expect(zip.rejectionReason).toContain('Source code archives');
    });

    it('should reject checksum and signature sidecars from installable binaries', () => {
      const sha = AssetClassifier.classify('henu-pa-windows-x64.exe.sha256', pattern);
      expect(sha.isInstallable).toBe(false);
      expect(sha.rejectionReason).toContain('Checksum or manifest');

      const sig = AssetClassifier.classify('henu-pa-windows-x64.exe.sig', pattern);
      expect(sig.isInstallable).toBe(false);
      expect(sig.rejectionReason).toContain('Cryptographic signature');
    });

    it('should reject assets not matching repository asset pattern', () => {
      const unmatching = AssetClassifier.classify('random-tool-setup.bin', pattern);
      expect(unmatching.isInstallable).toBe(false);
      expect(unmatching.rejectionReason).toContain('does not match application asset pattern');
    });
  });
});
