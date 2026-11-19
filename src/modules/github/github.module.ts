import { Global, Module } from '@nestjs/common';
import { GitHubAppService } from './github.service';

@Global()
@Module({
  providers: [GitHubAppService],
  exports: [GitHubAppService],
})
export class GitHubModule {}
