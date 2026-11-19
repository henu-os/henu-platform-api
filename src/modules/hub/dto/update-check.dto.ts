import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum TargetOs {
  WINDOWS = 'WINDOWS',
  MACOS = 'MACOS',
  LINUX = 'LINUX',
}

export enum TargetArch {
  X86_64 = 'X86_64',
  ARM64 = 'ARM64',
  UNIVERSAL = 'UNIVERSAL',
}

export class UpdateCheckQueryDto {
  @ApiProperty({ description: 'Application slug', example: 'henu-ide' })
  @IsString()
  @IsNotEmpty()
  app: string;

  @ApiPropertyOptional({ description: 'Release channel', example: 'STABLE', default: 'STABLE' })
  @IsString()
  @IsOptional()
  channel: string = 'STABLE';

  @ApiProperty({ description: 'Currently installed semver version', example: '0.9.8' })
  @IsString()
  @IsNotEmpty()
  currentVersion: string;

  @ApiProperty({ enum: TargetOs, example: TargetOs.WINDOWS })
  @IsEnum(TargetOs)
  @IsNotEmpty()
  os: TargetOs;

  @ApiProperty({ enum: TargetArch, example: TargetArch.X86_64 })
  @IsEnum(TargetArch)
  @IsNotEmpty()
  arch: TargetArch;
}

export class UpdateCheckResponseDto {
  @ApiProperty({ example: true })
  updateAvailable: boolean;

  @ApiProperty({ example: 'henu-ide' })
  appSlug: string;

  @ApiPropertyOptional({ example: 'STABLE' })
  channel?: string;

  @ApiProperty({ example: '0.9.8' })
  currentVersion: string;

  @ApiProperty({ example: '1.0.0' })
  latestVersion: string;

  @ApiPropertyOptional({ example: '2026-11-19T10:30:00.000Z' })
  publishedAt?: string;

  @ApiPropertyOptional({ example: '### Features\n- Initial release.' })
  changelog?: string;

  @ApiPropertyOptional()
  asset?: {
    fileName: string;
    downloadUrl: string;
    sizeBytes: number;
    sha256: string;
    packageFormat: string;
    minOsVersion?: string;
  };
}
