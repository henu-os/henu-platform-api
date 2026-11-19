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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RepositoriesManagementService } from './repositories.service';
import {
  CreateRepositoryConnectionDto,
  UpdateRepositoryConnectionDto,
  UpdateRepositoryStatusDto,
} from './dto/repository-connection.dto';
import { JwtAuthGuard } from '@/common/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/common/auth/guards/permissions.guard';
import { RequirePermissions } from '@/common/auth/decorators/require-permissions.decorator';
import { PermissionCode } from '@/common/auth/constants';
import { AuthenticatedUser, CurrentUser } from '@/common/auth/decorators/current-user.decorator';

@ApiTags('Admin - Repository Connections')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/repositories')
export class RepositoriesManagementController {
  constructor(private readonly reposService: RepositoriesManagementService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PermissionCode.REPOS_CREATE)
  @ApiOperation({ summary: 'Connect a GitHub repository to an application' })
  @ApiResponse({ status: 201, description: 'Repository connection created' })
  @ApiResponse({ status: 409, description: 'Repository already connected to another application' })
  async createConnection(
    @Body() dto: CreateRepositoryConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.reposService.createConnection(dto, actor, ipAddress, userAgent);
  }

  @Get()
  @RequirePermissions(PermissionCode.REPOS_READ)
  @ApiOperation({ summary: 'List all repository connections' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'List of repository connections returned' })
  async listConnections(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.reposService.listConnections(parseInt(page, 10) || 1, parseInt(limit, 10) || 20);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.REPOS_READ)
  @ApiOperation({ summary: 'Retrieve specific repository connection details' })
  @ApiResponse({ status: 200, description: 'Repository connection returned' })
  @ApiResponse({ status: 404, description: 'Repository connection not found' })
  async getConnection(@Param('id') id: string) {
    return this.reposService.getConnection(id);
  }

  @Put(':id')
  @RequirePermissions(PermissionCode.REPOS_UPDATE)
  @ApiOperation({ summary: 'Update repository connection configuration and asset regex patterns' })
  @ApiResponse({ status: 200, description: 'Repository connection updated' })
  async updateConnection(
    @Param('id') id: string,
    @Body() dto: UpdateRepositoryConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.reposService.updateConnection(id, dto, actor, ipAddress, userAgent);
  }

  @Patch(':id/status')
  @RequirePermissions(PermissionCode.REPOS_UPDATE)
  @ApiOperation({ summary: 'Enable or disable a repository connection' })
  @ApiResponse({ status: 200, description: 'Repository status updated' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRepositoryStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.reposService.updateStatus(id, dto.isActive, actor, ipAddress, userAgent);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.REPOS_DELETE)
  @ApiOperation({ summary: 'Soft-delete a repository connection' })
  @ApiResponse({ status: 200, description: 'Repository connection deleted' })
  async deleteConnection(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.get('user-agent');
    return this.reposService.deleteConnection(id, actor, ipAddress, userAgent);
  }
}
