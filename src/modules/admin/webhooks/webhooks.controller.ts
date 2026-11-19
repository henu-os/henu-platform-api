import {
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
import { WebhooksService } from '@/modules/webhooks/webhooks.service';
import { ListWebhooksQueryDto } from './dto/webhooks-admin.dto';

@ApiTags('Admin Webhooks Management')
@ApiBearerAuth('JWT-Admin')
@Controller('admin/webhooks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WebhooksAdminController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  @RequirePermissions(PermissionCode.WEBHOOKS_READ)
  @ApiOperation({ summary: 'List received webhook events with pagination and status filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of webhook events' })
  async listWebhooks(@Query() query: ListWebhooksQueryDto) {
    return this.webhooksService.listWebhookEvents(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.WEBHOOKS_READ)
  @ApiOperation({ summary: 'Retrieve full delivery details and payload of a webhook event' })
  @ApiResponse({ status: 200, description: 'Webhook event delivery details' })
  @ApiResponse({ status: 404, description: 'Webhook event not found' })
  async getWebhook(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooksService.getWebhookEvent(id);
  }

  @Post(':id/replay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.WEBHOOKS_WRITE)
  @ApiOperation({
    summary: 'Replay a failed or previous webhook event through the ingestion pipeline',
  })
  @ApiResponse({ status: 200, description: 'Webhook event successfully replayed' })
  @ApiResponse({ status: 404, description: 'Webhook event not found' })
  async replayWebhook(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];
    return this.webhooksService.replayWebhookEvent(id, user, ipAddress, userAgent);
  }
}
