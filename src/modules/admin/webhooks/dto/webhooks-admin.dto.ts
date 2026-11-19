import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { WebhookStatus } from '@prisma/client';

export class ListWebhooksQueryDto {
  @ApiPropertyOptional({ enum: WebhookStatus, description: 'Filter by webhook status' })
  @IsOptional()
  @IsEnum(WebhookStatus)
  status?: WebhookStatus;

  @ApiPropertyOptional({ description: 'Filter by event type (e.g., release, ping)' })
  @IsOptional()
  @IsString()
  eventType?: string;

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
