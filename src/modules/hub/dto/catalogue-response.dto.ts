import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlatformAssetDto {
  @ApiProperty({ example: 'HENU-IDE-Setup-1.0.0.exe' })
  fileName: string;

  @ApiProperty({
    example:
      'https://github.com/henu-os/henu-ide/releases/download/v1.0.0/HENU-IDE-Setup-1.0.0.exe',
  })
  downloadUrl: string;

  @ApiProperty({ example: 98450124 })
  sizeBytes: number;

  @ApiProperty({ example: '8f48e3e41416e7921a976be0fa8c826cf9c7b949b29fd135e6c518cfcfd89552' })
  sha256: string;

  @ApiProperty({ example: 'WINDOWS' })
  os: string;

  @ApiProperty({ example: 'X86_64' })
  arch: string;

  @ApiProperty({ example: 'EXE' })
  packageFormat: string;
}

export class ChannelReleaseDto {
  @ApiProperty({ example: '1.0.0' })
  version: string;

  @ApiProperty({ example: 'v1.0.0' })
  tagName: string;

  @ApiProperty({ example: '2026-11-19T10:30:00.000Z' })
  publishedAt: string;

  @ApiProperty({ example: '### Features\n- Initial release.' })
  changelog: string;

  @ApiProperty({ type: [PlatformAssetDto] })
  assets: PlatformAssetDto[];
}

export class SupportedPlatformDto {
  @ApiProperty({ example: 'WINDOWS' })
  os: string;

  @ApiProperty({ example: 'X86_64' })
  arch: string;

  @ApiPropertyOptional({ example: 'Windows 10 21H2' })
  minOsVersion?: string;

  @ApiProperty({ example: 'EXE' })
  packageFormat: string;
}

export class CatalogueApplicationDto {
  @ApiProperty({ example: 'henu-ide' })
  slug: string;

  @ApiProperty({ example: 'HENU IDE' })
  displayName: string;

  @ApiProperty({ example: 'Next-generation cloud-native developer environment for HENU OS' })
  summary: string;

  @ApiProperty({
    example:
      'Comprehensive IDE with native AI assistance, container integration, and collaborative editing.',
  })
  description: string;

  @ApiProperty({ example: 'DEVELOPMENT' })
  category: string;

  @ApiProperty({ example: 'HENU OS PRIVATE LIMITED' })
  developer: string;

  @ApiProperty({ example: 'https://assets.henuos.com/icons/henu-ide.svg' })
  iconUrl: string;

  @ApiPropertyOptional({ example: 'https://assets.henuos.com/banners/henu-ide.webp' })
  bannerUrl?: string;

  @ApiProperty({ example: true })
  featured: boolean;

  @ApiProperty({ type: [SupportedPlatformDto] })
  supportedPlatforms: SupportedPlatformDto[];

  @ApiProperty({
    description: 'Release channels mapping (e.g. STABLE, BETA, NIGHTLY)',
    example: {
      STABLE: {
        version: '1.0.0',
        tagName: 'v1.0.0',
        publishedAt: '2026-11-19T10:30:00.000Z',
        changelog: 'Initial GA release.',
        assets: [],
      },
    },
  })
  channels: Record<string, ChannelReleaseDto>;
}

export class CatalogueManifestResponseDto {
  @ApiProperty({ example: '1.0.0' })
  schemaVersion: string;

  @ApiProperty({ example: 42 })
  revision: number;

  @ApiProperty({ example: '2026-11-19T10:45:00.000Z' })
  generatedAt: string;

  @ApiProperty({ example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' })
  contentHash: string;

  @ApiProperty({ example: ['STABLE', 'BETA', 'NIGHTLY'] })
  channels: string[];

  @ApiProperty({ type: [CatalogueApplicationDto] })
  applications: CatalogueApplicationDto[];
}
