import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || 'unknown';
    const requestId = req.headers['x-request-id'] || 'none';
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;
          this.logger.log(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              requestId,
              method,
              url: originalUrl,
              statusCode,
              durationMs: duration,
              clientIp: ip,
              userAgent,
            }),
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;
          this.logger.error(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              requestId,
              method,
              url: originalUrl,
              statusCode,
              durationMs: duration,
              clientIp: ip,
              userAgent,
              errorMessage: error.message,
            }),
          );
        },
      }),
    );
  }
}
