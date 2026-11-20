import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { Rfc7807ExceptionFilter } from './common/filters/rfc7807-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { BigIntInterceptor } from './common/interceptors/bigint.interceptor';

// Enable native BigInt JSON serialization globally across all controllers and responses
if (!(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    const n = Number(this);
    return Number.isSafeInteger(n) ? n : this.toString();
  };
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Initialize application with raw body buffer preserved for webhook verification
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 3000;
  const apiPrefix = configService.get<string>('apiPrefix') || 'api/v1';

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Strict CORS Policy (No un-justified wildcards)
  const allowedAdminOrigins = configService.get<string[]>('cors.adminOrigins') || [];
  const allowedHubOrigins = configService.get<string[]>('cors.hubOrigins') || [];
  const combinedAllowedOrigins = [...allowedAdminOrigins, ...allowedHubOrigins];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. desktop native apps, cURL, GitHub webhooks)
      if (!origin) {
        return callback(null, true);
      }
      if (
        combinedAllowedOrigins.includes(origin) ||
        origin.startsWith('tauri://') ||
        origin.startsWith('vscode-webview://') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.endsWith('.netlify.app') ||
        origin.endsWith('.henuos.in') ||
        origin.endsWith('.henuos.com')
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin '${origin}' not permitted by CORS policy`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-Hub-Signature-256',
      'X-GitHub-Delivery',
      'X-GitHub-Event',
      'If-None-Match',
    ],
    exposedHeaders: ['ETag', 'X-Request-Id'],
    credentials: true,
  });

  // Global Prefix (excluding health probes and Swagger UI)
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health/live', 'health/ready', 'api/docs'],
  });

  // Global Pipes, Filters & Interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );

  app.useGlobalFilters(new Rfc7807ExceptionFilter());
  app.useGlobalInterceptors(new BigIntInterceptor(), new LoggingInterceptor());

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('HENU Platform API')
    .setDescription(
      'Central backend, release orchestration, and catalogue publication engine for HENU OS PRIVATE LIMITED.\n\n' +
        'Official Website: https://www.henuos.in/\n' +
        'Contact & Inquiries: https://www.henuos.in/contact | info@henuos.in | support.henuos@gmail.com\n' +
        'Support Hotline & WhatsApp: +91 8094100513 (https://wa.me/918094100513)\n' +
        'Consultation Scheduling: https://calendly.com/henuos/30min',
    )
    .setVersion('1.1.0')
    .setContact(
      'HENU OS PRIVATE LIMITED Support',
      'https://www.henuos.in/contact',
      'info@henuos.in',
    )
    .setLicense('Proprietary / All Rights Reserved', 'https://www.henuos.in/')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your administrative JWT access token',
      },
      'bearer',
    )
    .addTag('HENU HUB Desktop (Public Client)', 'Public catalog and update check endpoints')
    .addTag('HENU Administration Panel', 'Administrative application and release control')
    .addTag('Webhooks Ingress', 'GitHub App webhook listeners with HMAC-SHA256 signature guards')
    .addTag('Operations & Health', 'Kubernetes readiness and liveness diagnostics')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Enable graceful process termination
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  logger.log(`HENU Platform API running on port ${port} [Prefix: /${apiPrefix}]`);
  logger.log(`OpenAPI Documentation available at: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Fatal error during application startup:', err);
  process.exit(1);
});
