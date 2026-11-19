import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@Injectable()
export class GitHubSignatureGuard implements CanActivate {
  private readonly logger = new Logger(GitHubSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithRawBody>();
    const signatureHeader = request.headers['x-hub-signature-256'];
    const webhookSecret = this.configService.get<string>('github.webhookSecret');

    if (!webhookSecret) {
      this.logger.error('GITHUB_WEBHOOK_SECRET is not configured on the server.');
      throw new UnauthorizedException('Webhook verification misconfigured.');
    }

    if (!signatureHeader || typeof signatureHeader !== 'string') {
      this.logger.warn('Rejected incoming webhook: Missing X-Hub-Signature-256 header.');
      throw new UnauthorizedException('Missing signature header.');
    }

    if (!signatureHeader.startsWith('sha256=')) {
      this.logger.warn('Rejected incoming webhook: Malformed X-Hub-Signature-256 header.');
      throw new UnauthorizedException('Malformed signature header.');
    }

    const rawBody = request.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      this.logger.error('Raw body buffer is unavailable. Ensure rawBody is enabled in NestJS app.');
      throw new UnauthorizedException('Raw request body unavailable for signature verification.');
    }

    const signatureHex = signatureHeader.substring(7);
    const expectedHmacHex = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedHmacHex, 'utf8');
    const actualBuffer = Buffer.from(signatureHex, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      this.logger.warn('Rejected incoming webhook: Signature buffer length mismatch.');
      throw new UnauthorizedException('Invalid signature.');
    }

    const isValid = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    if (!isValid) {
      this.logger.warn('Rejected incoming webhook: Cryptographic signature mismatch.');
      throw new UnauthorizedException('Invalid signature.');
    }

    return true;
  }
}
