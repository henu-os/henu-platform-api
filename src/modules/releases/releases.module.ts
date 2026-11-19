import { Module } from '@nestjs/common';
import { ReleasesService } from './releases.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { GitHubModule } from '../github/github.module';

@Module({
  imports: [PrismaModule, AuditModule, GitHubModule],
  providers: [ReleasesService],
  exports: [ReleasesService],
})
export class ReleasesModule {}
