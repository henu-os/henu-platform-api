import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CatalogueManagementService } from '../modules/admin/catalogue/catalogue.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const catalogueService = app.get(CatalogueManagementService);
  
  const result = await catalogueService.publishRevision('Publish with webAppUrl and desktop shortcuts support');
  console.log('Revision published successfully:', result.revisionNumber, 'ContentHash:', result.contentHash);
  
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Publish error:', err);
  process.exit(1);
});
