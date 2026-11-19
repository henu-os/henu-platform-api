import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  Matches,
} from 'class-validator';

export enum ApplicationStatusEnum {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  DEPRECATED = 'DEPRECATED',
  ARCHIVED = 'ARCHIVED',
}

export enum ApplicationTypeEnum {
  DESKTOP = 'DESKTOP',
  WEB = 'WEB',
  HYBRID = 'HYBRID',
  CLI = 'CLI',
}

export enum OperatingSystemEnum {
  WINDOWS = 'WINDOWS',
  MACOS = 'MACOS',
  LINUX = 'LINUX',
}

export enum CpuArchitectureEnum {
  X86_64 = 'X86_64',
  ARM64 = 'ARM64',
  UNIVERSAL = 'UNIVERSAL',
}

export enum PackageFormatEnum {
  EXE = 'EXE',
  MSI = 'MSI',
  DMG = 'DMG',
  PKG = 'PKG',
  APPIMAGE = 'APPIMAGE',
  DEB = 'DEB',
  RPM = 'RPM',
  TAR_GZ = 'TAR_GZ',
  ZIP = 'ZIP',
}

export class CreateApplicationDto {
  @ApiProperty({
    example: 'henu-pa',
    description: 'Unique lowercase alphanumeric kebab-case slug identifier',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lower-case alphanumeric with hyphens (e.g., henu-pa, henu-ide)',
  })
  slug: string;

  @ApiProperty({ example: 'HENU PA', description: 'Formal application title' })
  @IsString()
  @IsNotEmpty()
  displayName: string;

  @ApiProperty({ example: 'Personal Assistant and productivity engine for HENU OS' })
  @IsString()
  @IsNotEmpty()
  summary: string;

  @ApiProperty({ example: 'Full Markdown application description...' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'PRODUCTIVITY' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'HENU OS PRIVATE LIMITED' })
  @IsString()
  @IsOptional()
  developer?: string = 'HENU OS PRIVATE LIMITED';

  @ApiProperty({ example: 'https://assets.henuos.com/icons/henu-pa.svg' })
  @IsUrl()
  @IsNotEmpty()
  iconUrl: string;

  @ApiPropertyOptional({ example: 'https://assets.henuos.com/banners/henu-pa.webp' })
  @IsUrl()
  @IsOptional()
  bannerUrl?: string;

  @ApiPropertyOptional({ example: 'https://henuos.com/apps/pa' })
  @IsUrl()
  @IsOptional()
  homepageUrl?: string;

  @ApiPropertyOptional({ example: 'https://docs.henuos.com/pa' })
  @IsUrl()
  @IsOptional()
  docsUrl?: string;

  @ApiPropertyOptional({ example: 'https://app.henuos.com/pa' })
  @IsUrl()
  @IsOptional()
  webAppUrl?: string;

  @ApiPropertyOptional({ example: 'Proprietary' })
  @IsString()
  @IsOptional()
  license?: string = 'Proprietary';

  @ApiPropertyOptional({ enum: ApplicationTypeEnum, default: ApplicationTypeEnum.DESKTOP })
  @IsEnum(ApplicationTypeEnum)
  @IsOptional()
  appType?: ApplicationTypeEnum = ApplicationTypeEnum.DESKTOP;

  @ApiPropertyOptional({
    example: '1.0.0',
    description: 'Minimum HENU HUB client version required',
  })
  @IsString()
  @IsOptional()
  minHubVersion?: string;

  @ApiPropertyOptional({
    description: 'System or application dependencies schema',
    example: { python: '>=3.11', memoryGb: 4 },
  })
  @IsOptional()
  dependencies?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ApplicationStatusEnum, default: ApplicationStatusEnum.DRAFT })
  @IsEnum(ApplicationStatusEnum)
  @IsOptional()
  status?: ApplicationStatusEnum = ApplicationStatusEnum.DRAFT;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  featured?: boolean = false;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number = 0;
}

export class UpdateApplicationDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  summary?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  developer?: string;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  iconUrl?: string;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  bannerUrl?: string;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  homepageUrl?: string;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  docsUrl?: string;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  webAppUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  license?: string;

  @ApiPropertyOptional({ enum: ApplicationTypeEnum })
  @IsEnum(ApplicationTypeEnum)
  @IsOptional()
  appType?: ApplicationTypeEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  minHubVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  dependencies?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  featured?: boolean;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateApplicationStatusDto {
  @ApiProperty({ enum: ApplicationStatusEnum })
  @IsEnum(ApplicationStatusEnum)
  @IsNotEmpty()
  status: ApplicationStatusEnum;
}

export class PlatformCompatibilityDto {
  @ApiProperty({ enum: OperatingSystemEnum })
  @IsEnum(OperatingSystemEnum)
  @IsNotEmpty()
  os: OperatingSystemEnum;

  @ApiProperty({ enum: CpuArchitectureEnum })
  @IsEnum(CpuArchitectureEnum)
  @IsNotEmpty()
  arch: CpuArchitectureEnum;

  @ApiProperty({ enum: PackageFormatEnum })
  @IsEnum(PackageFormatEnum)
  @IsNotEmpty()
  packageFormat: PackageFormatEnum;

  @ApiPropertyOptional({ example: 'Windows 10 21H2' })
  @IsString()
  @IsOptional()
  minOsVersion?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  maxOsVersion?: string;

  @ApiPropertyOptional({ example: 'henu-pa.exe' })
  @IsString()
  @IsOptional()
  launchExecutableName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  installInstructions?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isSupported?: boolean = true;
}

export class QueryApplicationsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: string = '1';

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: string = '20';

  @ApiPropertyOptional({ description: 'Search query matching slug, displayName, or summary' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: ApplicationStatusEnum })
  @IsEnum(ApplicationStatusEnum)
  @IsOptional()
  status?: ApplicationStatusEnum;

  @ApiPropertyOptional({ enum: ApplicationTypeEnum })
  @IsEnum(ApplicationTypeEnum)
  @IsOptional()
  appType?: ApplicationTypeEnum;
}
