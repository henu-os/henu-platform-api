import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/common/auth/guards/permissions.guard';
import { RequirePermissions } from '@/common/auth/decorators/require-permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '@/common/auth/decorators/current-user.decorator';
import { PermissionCode } from '@/common/auth/constants';
import { ReleasesService } from '@/modules/releases/releases.service';
import { CatalogueManagementService } from '../catalogue/catalogue.service';
import {
  ListReleasesQueryDto,
  PromoteReleaseDto,
  RevokeReleaseDto,
} from './dto/releases-management.dto';

@ApiTags('Admin Releases Management')
@ApiBearerAuth('JWT-Admin')
@Controller('admin/releases')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReleasesManagementController {
  constructor(
    private readonly releasesService: ReleasesService,
    private readonly catalogueService: CatalogueManagementService,
  ) {}

  @Get()
  @RequirePermissions(PermissionCode.RELEASES_READ)
  @ApiOperation({ summary: 'List releases with pagination, channel and status filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of releases' })
  async listReleases(@Query() query: ListReleasesQueryDto) {
    return this.releasesService.listReleases(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.RELEASES_READ)
  @ApiOperation({ summary: 'Retrieve full details of a release including verified assets' })
  @ApiResponse({ status: 200, description: 'Release details and associated assets' })
  @ApiResponse({ status: 404, description: 'Release not found' })
  async getRelease(@Param('id', ParseUUIDPipe) id: string) {
    return this.releasesService.getRelease(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.RELEASES_UPDATE)
  @ApiOperation({ summary: 'Approve a validated release for distribution eligibility' })
  @ApiResponse({ status: 200, description: 'Release approved' })
  @ApiResponse({ status: 400, description: 'Release in invalid state for approval' })
  async approveRelease(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];
    return this.releasesService.approveRelease(id, user, ipAddress, userAgent);
  }

  @Post(':id/promote')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.RELEASES_PUBLISH)
  @ApiOperation({
    summary: 'Promote a release to target channel (e.g., STABLE) and publish immediately',
  })
  @ApiResponse({ status: 200, description: 'Release promoted and published' })
  @ApiResponse({ status: 400, description: 'Invalid release state or target channel' })
  async promoteRelease(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PromoteReleaseDto,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];
    const updated = await this.releasesService.promoteRelease(id, dto.targetChannel, user, ipAddress, userAgent);
    try {
      await this.catalogueService.publishRevision(
        `Auto-publish: Release ${updated.version} promoted to ${dto.targetChannel}`,
        user,
        ipAddress,
        userAgent,
      );
    } catch {}
    return updated;
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.RELEASES_REVOKE)
  @ApiOperation({ summary: 'Revoke a compromised or recalled release from distribution' })
  @ApiResponse({ status: 200, description: 'Release revoked' })
  @ApiResponse({ status: 404, description: 'Release not found' })
  async revokeRelease(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeReleaseDto,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];
    const updated = await this.releasesService.revokeRelease(id, dto.reason, user, ipAddress, userAgent);
    try {
      await this.catalogueService.publishRevision(
        `Auto-publish: Release ${updated.version} revoked: ${dto.reason}`,
        user,
        ipAddress,
        userAgent,
      );
    } catch {}
    return updated;
  }
}
