import { Controller, Get, HttpCode, HttpStatus, Optional } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';

@ApiTags('Operations & Health')
@Controller('health')
export class HealthController {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kubernetes/Container liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive and accepting traffic.' })
  checkLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kubernetes/Container readiness probe' })
  @ApiResponse({ status: 200, description: 'Service and dependencies are ready.' })
  @ApiResponse({ status: 503, description: 'Service or dependencies not ready.' })
  async checkReadiness() {
    let databaseStatus = 'disconnected';

    if (this.prisma) {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        databaseStatus = 'connected';
      } catch (err) {
        databaseStatus = `unavailable: ${(err as Error).message}`;
      }
    }

    const isReady = databaseStatus === 'connected';

    const rawUrl = process.env.DATABASE_URL || '';
    const trimmed = rawUrl.trim();
    const diagnostics = {
      database: {
        configured: rawUrl.length > 0,
        length: rawUrl.length,
        startsWithProtocol:
          trimmed.startsWith('postgresql://') || trimmed.startsWith('postgres://'),
        hasEnclosingQuotes:
          (rawUrl.startsWith('"') && rawUrl.endsWith('"')) ||
          (rawUrl.startsWith("'") && rawUrl.endsWith("'")),
        hasWhitespace: /\s/.test(rawUrl),
        startsWithPsqlCli: trimmed.startsWith('psql'),
        containsPlaceholder:
          rawUrl.includes('REPLACE_WITH') ||
          rawUrl.includes('placeholder') ||
          rawUrl.includes('example.com'),
        prismaInitialized: Boolean(this.prisma),
      },
    };

    return {
      status: isReady ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: databaseStatus,
      },
      diagnostics,
    };
  }
}
