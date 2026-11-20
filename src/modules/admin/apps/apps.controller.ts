import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AppsManagementService } from './apps.service';
import {
  CreateApplicationDto,
  UpdateApplicationDto,
  UpdateApplicationStatusDto,
  PlatformCompatibilityDto,
  QueryApplicationsDto,
} from './dto/app-management.dto';
import { JwtAuthGuard } from '@/common/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/common/auth/guards/permissions.guard';
import { RequirePermissions } from '@/common/auth/decorators/require-permissions.decorator';
import { PermissionCode } from '@/common/auth/constants';
import { AuthenticatedUser, CurrentUser } from '@/common/auth/decorators/current-user.decorator';

@ApiTags('Admin - Application Management')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/apps')
export class AppsManagementController {
  constructor(private readonly appsService: AppsManagementService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PermissionCode.APPS_CREATE)
  @ApiOperation({
    summary: 'Register a new HENU application with dynamic metadata and configuration',
  })
  @ApiResponse({ status: 201, description: 'Application registered' })
  @ApiResponse({ status: 409, description: 'Application slug already exists' })
  async registerApp(
    @Body() dto: CreateApplicationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.appsService.registerApplication(dto, actor, ipAddress, userAgent);
  }

  @Get()
  @RequirePermissions(PermissionCode.APPS_READ)
  @ApiOperation({ summary: 'List registered applications with filtering, search, and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of applications returned' })
  async listApps(@Query() query: QueryApplicationsDto) {
    return this.appsService.listApplications(query);
  }

  @Get(':idOrSlug')
  @RequirePermissions(PermissionCode.APPS_READ)
  @ApiOperation({ summary: 'Retrieve full application details by ID or unique slug' })
  @ApiResponse({ status: 200, description: 'Application details returned' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async getApp(@Param('idOrSlug') idOrSlug: string) {
    return this.appsService.getApplication(idOrSlug);
  }

  @Put(':id')
  @RequirePermissions(PermissionCode.APPS_UPDATE)
  @ApiOperation({
    summary: 'Update application metadata, branding, URLs, dependencies and configuration',
  })
  @ApiResponse({ status: 200, description: 'Application updated' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async updateApp(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.appsService.updateApplication(id, dto, actor, ipAddress, userAgent);
  }

  @Patch(':id/status')
  @RequirePermissions(PermissionCode.APPS_UPDATE)
  @ApiOperation({ summary: 'Enable, disable or change operational status of an application' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.appsService.updateStatus(id, dto.status, actor, ipAddress, userAgent);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.APPS_ARCHIVE)
  @ApiOperation({ summary: 'Archive an application and soft-delete from public feeds' })
  @ApiResponse({ status: 200, description: 'Application archived' })
  async archiveApp(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.appsService.archiveApplication(id, actor, ipAddress, userAgent);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.APPS_DELETE)
  @ApiOperation({ summary: 'Delete an application and remove from active catalogue' })
  @ApiResponse({ status: 200, description: 'Application deleted' })
  async deleteApp(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.appsService.deleteApplication(id, actor, ipAddress, userAgent);
  }

  @Post(':id/compatibility')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PermissionCode.COMPAT_MANAGE)
  @ApiOperation({ summary: 'Configure or update platform and architecture compatibility rules' })
  @ApiResponse({ status: 201, description: 'Platform compatibility rule saved' })
  async addCompatibility(
    @Param('id') id: string,
    @Body() dto: PlatformCompatibilityDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.appsService.addPlatformCompatibility(id, dto, actor, ipAddress, userAgent);
  }

  @Delete(':id/compatibility/:compatId')
  @RequirePermissions(PermissionCode.COMPAT_MANAGE)
  @ApiOperation({ summary: 'Remove a platform compatibility rule' })
  @ApiResponse({ status: 200, description: 'Platform compatibility rule deleted' })
  async removeCompatibility(
    @Param('id') id: string,
    @Param('compatId') compatId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.appsService.removePlatformCompatibility(id, compatId, actor, ipAddress, userAgent);
  }
}
