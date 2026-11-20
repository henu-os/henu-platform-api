import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  Sse,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { HubService } from './hub.service';
import { RealtimeEventsService, SseMessageEvent } from '@/common/realtime/realtime-events.service';
import { CatalogueSignerService } from '@/common/crypto/catalogue-signer.service';
import {
  CatalogueApplicationDto,
  CatalogueManifestResponseDto,
} from './dto/catalogue-response.dto';
import { UpdateCheckQueryDto, UpdateCheckResponseDto } from './dto/update-check.dto';
import {
  CreateDesktopShortcutDto,
  DesktopShortcutResponseDto,
} from './dto/desktop-shortcut.dto';

@ApiTags('HENU HUB Desktop (Public Client)')
@Controller('hub')
export class HubController {
  constructor(
    private readonly hubService: HubService,
    private readonly realtimeEventsService: RealtimeEventsService,
    private readonly signerService: CatalogueSignerService,
  ) {}

  @Get('catalogue/signing-keys')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve authoritative Ed25519 public signing keys for catalogue verification' })
  @ApiResponse({ status: 200, description: 'Returns trusted public keys' })
  getSigningKeys() {
    return {
      keys: this.signerService.getTrustedKeys(),
    };
  }

  @Get('catalogue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch active public application catalogue manifest' })
  @ApiHeader({
    name: 'If-None-Match',
    required: false,
    description: 'Client cached catalogue content hash',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns active catalogue manifest',
    type: CatalogueManifestResponseDto,
  })
  @ApiResponse({ status: 304, description: 'Catalogue has not changed since last revision' })
  async getCatalogue(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CatalogueManifestResponseDto | void> {
    const { manifest, contentHash } = await this.hubService.getLatestCatalogue();
    const quotedEtag = `"${contentHash}"`;

    res.setHeader('ETag', quotedEtag);
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');

    if (ifNoneMatch && (ifNoneMatch === quotedEtag || ifNoneMatch === contentHash)) {
      res.status(HttpStatus.NOT_MODIFIED);
      return;
    }

    return manifest;
  }

  @Get('apps/:slug')
  @ApiOperation({ summary: 'Fetch specific public application details' })
  @ApiResponse({ status: 200, description: 'Application found', type: CatalogueApplicationDto })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async getAppBySlug(@Param('slug') slug: string): Promise<CatalogueApplicationDto> {
    return this.hubService.getApplicationBySlug(slug);
  }

  @Get('updates/check')
  @ApiOperation({ summary: 'Targeted application update verification' })
  @ApiResponse({ status: 200, description: 'Update check evaluated', type: UpdateCheckResponseDto })
  async checkForUpdates(@Query() query: UpdateCheckQueryDto): Promise<UpdateCheckResponseDto> {
    return this.hubService.checkForUpdates(query);
  }

  @Sse('events')
  @ApiOperation({ summary: 'Live Server-Sent Events stream for desktop client notifications with durable replay' })
  @ApiHeader({
    name: 'Last-Event-ID',
    required: false,
    description: 'ID of the last received event for reconnection replay',
  })
  streamEvents(
    @Headers('last-event-id') lastEventId?: string,
    @Query('lastEventId') queryLastEventId?: string,
  ): Observable<SseMessageEvent> {
    return this.realtimeEventsService.getEventStream(lastEventId || queryLastEventId);
  }

  @Sse('events/stream')
  @ApiOperation({
    summary: 'Live Server-Sent Events stream alias for desktop update notifications',
  })
  streamUpdates(
    @Headers('last-event-id') lastEventId?: string,
    @Query('lastEventId') queryLastEventId?: string,
  ): Observable<SseMessageEvent> {
    return this.realtimeEventsService.getEventStream(lastEventId || queryLastEventId);
  }

  @Post('desktop-shortcut')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update desktop shortcut on local host environment' })
  @ApiResponse({
    status: 200,
    description: 'Desktop shortcut created',
    type: DesktopShortcutResponseDto,
  })
  async createDesktopShortcut(
    @Body() dto: CreateDesktopShortcutDto,
  ): Promise<DesktopShortcutResponseDto> {
    return this.hubService.createDesktopShortcut(dto);
  }

  @Delete('desktop-shortcut/:name')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove desktop shortcut from local host environment' })
  async removeDesktopShortcut(@Param('name') name: string) {
    return this.hubService.removeDesktopShortcut(name);
  }
}
