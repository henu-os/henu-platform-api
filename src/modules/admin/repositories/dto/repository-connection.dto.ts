import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateRepositoryConnectionDto {
  @ApiProperty({ description: 'Target Application UUID' })
  @IsUUID()
  @IsNotEmpty()
  applicationId: string;

  @ApiProperty({ example: 'henu-os', description: 'GitHub organization or owner' })
  @IsString()
  @IsNotEmpty()
  repoOwner: string;

  @ApiProperty({ example: 'henu-pa', description: 'GitHub repository name' })
  @IsString()
  @IsNotEmpty()
  repoName: string;

  @ApiProperty({ example: 54910284, description: 'GitHub App Installation ID' })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  githubInstallationId: number;

  @ApiPropertyOptional({ default: 'main', description: 'Default canonical tracking branch' })
  @IsString()
  @IsOptional()
  targetBranch?: string = 'main';

  @ApiPropertyOptional({
    default: '.*\\.(exe|msi|dmg|AppImage|deb|rpm|zip)$',
    description: 'Regex pattern matching installable release assets',
  })
  @IsString()
  @IsOptional()
  assetPattern?: string = '.*\\.(exe|msi|dmg|AppImage|deb|rpm|zip)$';

  @ApiPropertyOptional({
    default: '^v?[0-9]+\\.[0-9]+\\.[0-9]+',
    description: 'Regex pattern matching semver git tags',
  })
  @IsString()
  @IsOptional()
  tagPattern?: string = '^v?[0-9]+\\.[0-9]+\\.[0-9]+';

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  autoIngestReleases?: boolean = true;

  @ApiPropertyOptional({
    type: [String],
    example: ['NIGHTLY'],
    description: 'Channels permitted to automatically publish without manual admin approval',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  autoPublishChannels?: string[] = [];

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateRepositoryConnectionDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  targetBranch?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  assetPattern?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tagPattern?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  autoIngestReleases?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  autoPublishChannels?: string[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateRepositoryStatusDto {
  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}
