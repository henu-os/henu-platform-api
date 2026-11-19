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
} from 'class-validator';

export enum AppStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  DEPRECATED = 'DEPRECATED',
  ARCHIVED = 'ARCHIVED',
}

export class CreateApplicationDto {
  @ApiProperty({ example: 'henu-ide', description: 'Unique immutable slug' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ example: 'HENU IDE', description: 'Formal application title' })
  @IsString()
  @IsNotEmpty()
  displayName: string;

  @ApiProperty({ example: 'Next-generation cloud-native IDE for HENU OS' })
  @IsString()
  @IsNotEmpty()
  summary: string;

  @ApiProperty({ example: 'Full details of the application capabilities...' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'DEVELOPMENT' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: 'HENU OS PRIVATE LIMITED' })
  @IsString()
  @IsOptional()
  developer?: string;

  @ApiProperty({ example: 'https://assets.henuos.com/icons/henu-ide.svg' })
  @IsUrl()
  @IsNotEmpty()
  iconUrl: string;

  @ApiPropertyOptional({ example: 'https://assets.henuos.com/banners/henu-ide.webp' })
  @IsUrl()
  @IsOptional()
  bannerUrl?: string;

  @ApiPropertyOptional({ example: 'https://henuos.com/apps/ide' })
  @IsUrl()
  @IsOptional()
  homepageUrl?: string;

  @ApiPropertyOptional({ example: 'https://docs.henuos.com/ide' })
  @IsUrl()
  @IsOptional()
  docsUrl?: string;

  @ApiPropertyOptional({ example: 'Proprietary' })
  @IsString()
  @IsOptional()
  license?: string;

  @ApiPropertyOptional({ enum: AppStatus, default: AppStatus.DRAFT })
  @IsEnum(AppStatus)
  @IsOptional()
  status?: AppStatus = AppStatus.DRAFT;

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

export class ApplicationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  summary: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  developer: string;

  @ApiProperty()
  iconUrl: string;

  @ApiPropertyOptional()
  bannerUrl?: string | null;

  @ApiPropertyOptional()
  homepageUrl?: string | null;

  @ApiPropertyOptional()
  docsUrl?: string | null;

  @ApiProperty()
  license: string;

  @ApiProperty({ enum: AppStatus })
  status: string;

  @ApiProperty()
  featured: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
