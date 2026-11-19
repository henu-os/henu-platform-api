import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ReleaseStatus } from '@prisma/client';

export class ListReleasesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by Application UUID' })
  @IsOptional()
  @IsUUID()
  applicationId?: string;

  @ApiPropertyOptional({ description: 'Filter by Channel UUID' })
  @IsOptional()
  @IsUUID()
  channelId?: string;

  @ApiPropertyOptional({ enum: ReleaseStatus, description: 'Filter by Release status' })
  @IsOptional()
  @IsEnum(ReleaseStatus)
  status?: ReleaseStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  limit?: number = 20;
}

export class PromoteReleaseDto {
  @ApiProperty({
    example: 'STABLE',
    description: 'Target channel name (e.g., STABLE, BETA, NIGHTLY)',
  })
  @IsNotEmpty()
  @IsString()
  targetChannel!: string;
}

export class RevokeReleaseDto {
  @ApiProperty({
    example: 'Critical security vulnerability discovered in binary payload',
    description: 'Administrative reason for revoking the release',
  })
  @IsNotEmpty()
  @IsString()
  reason!: string;
}
