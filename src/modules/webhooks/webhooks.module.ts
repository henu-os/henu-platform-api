import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { GitHubSignatureGuard } from './guards/github-signature.guard';
import { ReleasesModule } from '../releases/releases.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [ReleasesModule, AuditModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, GitHubSignatureGuard],
  exports: [WebhooksService],
})
export class WebhooksModule {}
