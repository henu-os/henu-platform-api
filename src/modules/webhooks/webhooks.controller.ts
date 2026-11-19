import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GitHubSignatureGuard } from './guards/github-signature.guard';
import { WebhooksService, WebhookIngestResult } from './webhooks.service';

@ApiTags('Webhooks Ingress')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('github')
  @HttpCode(HttpStatus.OK)
  @UseGuards(GitHubSignatureGuard)
  @ApiOperation({ summary: 'Ingress endpoint for GitHub App webhook events' })
  @ApiHeader({
    name: 'X-GitHub-Delivery',
    required: true,
    description: 'Unique GitHub delivery GUID',
  })
  @ApiHeader({
    name: 'X-GitHub-Event',
    required: true,
    description: 'GitHub event type (release, etc.)',
  })
  @ApiHeader({ name: 'X-Hub-Signature-256', required: true, description: 'HMAC-SHA256 signature' })
  @ApiResponse({ status: 200, description: 'Webhook acknowledged and queued' })
  @ApiResponse({ status: 401, description: 'Invalid HMAC signature or missing credentials' })
  async handleGitHubWebhook(
    @Headers('x-github-delivery') deliveryId: string,
    @Headers('x-github-event') eventType: string,
    @Body() payload: Record<string, unknown>,
  ): Promise<WebhookIngestResult> {
    const effectiveDeliveryId = deliveryId || `fallback-${Date.now()}`;
    const effectiveEventType = eventType || 'unknown';

    return this.webhooksService.processGitHubWebhook(
      effectiveDeliveryId,
      effectiveEventType,
      payload,
    );
  }
}
