import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitHubSignatureGuard } from './github-signature.guard';
import * as crypto from 'crypto';

describe('GitHubSignatureGuard', () => {
  let guard: GitHubSignatureGuard;
  const webhookSecret = 'test_webhook_secret_key_12345';

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'github.webhookSecret') return webhookSecret;
      return null;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    guard = new GitHubSignatureGuard(mockConfigService);
    jest.clearAllMocks();
  });

  function createMockContext(signatureHeader?: string, rawBody?: Buffer): ExecutionContext {
    const mockRequest = {
      headers: {
        'x-hub-signature-256': signatureHeader,
      },
      rawBody,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  }

  it('should throw UnauthorizedException if header is missing', () => {
    const context = createMockContext(undefined, Buffer.from('{}'));
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if rawBody buffer is missing', () => {
    const context = createMockContext('sha256=1234', undefined);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if HMAC signature is invalid', () => {
    const payload = Buffer.from(JSON.stringify({ action: 'published' }));
    const context = createMockContext(
      'sha256=invalidhexsignature000000000000000000000000000000000000000000000000',
      payload,
    );
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if GITHUB_WEBHOOK_SECRET is not configured', () => {
    const unconfiguredGuard = new GitHubSignatureGuard({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);
    const context = createMockContext('sha256=1234', Buffer.from('{}'));
    expect(() => unconfiguredGuard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if signature header does not start with sha256=', () => {
    const context = createMockContext('md5=1234567890', Buffer.from('{}'));
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if signature length is mismatched', () => {
    const context = createMockContext('sha256=short', Buffer.from('{}'));
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should return true when HMAC signature is cryptographically valid', () => {
    const payload = Buffer.from(
      JSON.stringify({ action: 'published', release: { tag_name: 'v1.0.0' } }),
    );
    const validHmac = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    const context = createMockContext(`sha256=${validHmac}`, payload);
    expect(guard.canActivate(context)).toBe(true);
  });
});
