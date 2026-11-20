import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export function normalizeDatabaseUrl(raw?: string): string | undefined {
  if (!raw) return raw;
  let url = raw.trim();

  // Strip Neon CLI command prefix: psql 'postgresql://...' or psql "postgresql://..."
  if (url.startsWith('psql ')) {
    url = url.slice(5).trim();
  }

  // Strip wrapping single or double quotes
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1).trim();
  }

  // Strip accidental "DATABASE_URL=" prefix
  if (url.startsWith('DATABASE_URL=')) {
    url = url.slice('DATABASE_URL='.length).trim();
  }

  return url;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const rawUrl = process.env.DATABASE_URL;
    const cleanUrl = normalizeDatabaseUrl(rawUrl);

    if (cleanUrl && cleanUrl !== rawUrl) {
      process.env.DATABASE_URL = cleanUrl;
    }

    super({
      datasources: cleanUrl
        ? {
            db: {
              url: cleanUrl,
            },
          }
        : undefined,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Successfully established connection to PostgreSQL database.');
    } catch (error) {
      this.logger.warn(`PostgreSQL connection not established yet: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL database.');
  }
}
