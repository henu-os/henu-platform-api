import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/common/auth/guards/permissions.guard';
import { CurrentUser, AuthenticatedUser } from '@/common/auth/decorators/current-user.decorator';
import { CatalogueManagementService } from './catalogue.service';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class PublishCatalogueDto {
  @IsString()
  @IsNotEmpty()
  summary: string;
}

export class RollbackCatalogueDto {
  @IsNumber()
  targetRevisionNumber: number;
}

@ApiTags('Admin - Catalogue Revisions & Publishing')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/catalogue')
export class CatalogueManagementController {
  constructor(private readonly catalogueService: CatalogueManagementService) {}

  @Get('revisions')
  @ApiOperation({ summary: 'List immutable catalogue revisions with publication metadata' })
  @ApiResponse({ status: 200, description: 'Revisions list returned' })
  async listRevisions() {
    return this.catalogueService.listRevisions();
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compile and publish a new immutable catalogue revision snapshot' })
  @ApiResponse({ status: 200, description: 'New revision compiled and published in real time' })
  async publishRevision(
    @Body() dto: PublishCatalogueDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.catalogueService.publishRevision(dto.summary, actor, ipAddress, userAgent);
  }

  @Post('rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revert active distribution catalogue to a previous verified revision' })
  @ApiResponse({ status: 200, description: 'Catalogue rolled back to target revision' })
  async rollbackCatalogue(
    @Body() dto: RollbackCatalogueDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.catalogueService.rollbackCatalogue(
      dto.targetRevisionNumber,
      actor,
      ipAddress,
      userAgent,
    );
  }
}
