import { Global, Module } from '@nestjs/common';
import { CatalogueSignerService } from './catalogue-signer.service';

@Global()
@Module({
  providers: [CatalogueSignerService],
  exports: [CatalogueSignerService],
})
export class CryptoModule {}
