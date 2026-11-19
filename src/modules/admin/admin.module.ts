import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AppsManagementController } from './apps/apps.controller';
import { AppsManagementService } from './apps/apps.service';
import { RepositoriesManagementController } from './repositories/repositories.controller';
import { RepositoriesManagementService } from './repositories/repositories.service';
import { ReleasesManagementController } from './releases/releases.controller';
import { WebhooksAdminController } from './webhooks/webhooks.controller';
import { AuthModule } from '../auth/auth.module';
import { ReleasesModule } from '../releases/releases.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [AuthModule, ReleasesModule, WebhooksModule],
  controllers: [
    AppsManagementController,
    RepositoriesManagementController,
    ReleasesManagementController,
    WebhooksAdminController,
  ],
  providers: [AdminService, AppsManagementService, RepositoriesManagementService],
  exports: [AdminService, AppsManagementService, RepositoriesManagementService],
})
export class AdminModule {}
