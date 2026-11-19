import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '@/common/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/common/auth/guards/permissions.guard';
import { RequirePermissions } from '@/common/auth/decorators/require-permissions.decorator';
import { PermissionCode } from '@/common/auth/constants';

@ApiTags('Admin - Audit Logs')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions(PermissionCode.AUDIT_READ)
  @ApiOperation({ summary: 'Query immutable append-only administrative audit logs' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'entityType', required: false, example: 'Application' })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'actorEmail', required: false })
  @ApiQuery({ name: 'action', required: false, example: 'APPLICATION_REGISTERED' })
  @ApiResponse({ status: 200, description: 'Audit logs returned' })
  async getAuditLogs(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorEmail') actorEmail?: string,
    @Query('action') action?: string,
  ) {
    return this.auditService.queryLogs({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      entityType,
      entityId,
      actorEmail,
      action,
    });
  }
}
