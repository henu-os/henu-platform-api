import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Res,
  Sse,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Observable, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { HubService } from './hub.service';
import {
  CatalogueApplicationDto,
  CatalogueManifestResponseDto,
} from './dto/catalogue-response.dto';
import { UpdateCheckQueryDto, UpdateCheckResponseDto } from './dto/update-check.dto';

interface SseMessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@ApiTags('HENU HUB Desktop (Public Client)')
@Controller('hub')
export class HubController {
  constructor(private readonly hubService: HubService) {}

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
      res.status(HttpStatus.NOT_MODIFIED).send();
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

  @Sse('events/stream')
  @ApiOperation({ summary: 'Live Server-Sent Events stream for desktop update notifications' })
  streamUpdates(): Observable<SseMessageEvent> {
    return interval(30000).pipe(
      map((sequence) => ({
        data: {
          event: 'heartbeat',
          timestamp: new Date().toISOString(),
          sequence,
        },
        type: 'ping',
      })),
    );
  }
}
