// Set minimal testing environment variables prior to module imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/henu_platform_test?schema=public';
process.env.JWT_SECRET = 'test_jwt_secret_key_minimum_length_required_for_testing_purposes_only';
process.env.GITHUB_WEBHOOK_SECRET = 'test_webhook_secret';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';

describe('HENU Platform API (e2e)', () => {
  let app: INestApplication;

  const mockPrismaService = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
    catalogueRevision: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    application: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    adminUser: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new Rfc7807ExceptionFilter());
    app.setGlobalPrefix('api/v1', {
      exclude: ['health/live', 'health/ready', 'api/docs'],
    });
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Health Probes', () => {
    it('/health/live (GET) - should return liveness 200 OK', () => {
      return request(app.getHttpServer())
        .get('/health/live')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.timestamp).toBeDefined();
        });
    });

    it('/health/ready (GET) - should return readiness 200 OK', () => {
      return request(app.getHttpServer())
        .get('/health/ready')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.services.database).toBe('connected');
        });
    });
  });

  describe('Public HUB Endpoints', () => {
    it('/api/v1/hub/catalogue (GET) - should return catalogue manifest with ETag', () => {
      return request(app.getHttpServer())
        .get('/api/v1/hub/catalogue')
        .expect(200)
        .expect((res) => {
          expect(res.header['etag']).toBeDefined();
          expect(res.body.schemaVersion).toBe('1.0.0');
          expect(Array.isArray(res.body.applications)).toBe(true);
        });
    });
  });

  describe('Authentication Security', () => {
    it('/api/v1/auth/login (POST) - should reject invalid credentials with 401', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@henuos.com',
          password: 'IncorrectPassword123!',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.type).toContain('errors/unauthorized');
        });
    });
  });

  describe('RBAC Protected Routes (Must Reject Unauthenticated Calls)', () => {
    it('/api/v1/admin/apps (GET) - should reject unauthenticated request with 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/apps')
        .expect(401)
        .expect((res) => {
          expect(res.body.type).toContain('errors/unauthorized');
        });
    });

    it('/api/v1/admin/repositories (GET) - should reject unauthenticated request with 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/repositories')
        .expect(401)
        .expect((res) => {
          expect(res.body.type).toContain('errors/unauthorized');
        });
    });

    it('/api/v1/admin/audit (GET) - should reject unauthenticated request with 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/audit')
        .expect(401)
        .expect((res) => {
          expect(res.body.type).toContain('errors/unauthorized');
        });
    });

    it('/api/v1/admin/releases (GET) - should reject unauthenticated request with 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/releases')
        .expect(401)
        .expect((res) => {
          expect(res.body.type).toContain('errors/unauthorized');
        });
    });

    it('/api/v1/admin/webhooks (GET) - should reject unauthenticated request with 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/webhooks')
        .expect(401)
        .expect((res) => {
          expect(res.body.type).toContain('errors/unauthorized');
        });
    });
  });

  describe('Webhook Ingress Security', () => {
    it('/api/v1/webhooks/github (POST) - should reject unsigned incoming webhook with 401', () => {
      return request(app.getHttpServer())
        .post('/api/v1/webhooks/github')
        .send({ zen: 'Testing webhook auth' })
        .expect(401)
        .expect((res) => {
          expect(res.body.type).toContain('errors/unauthorized');
        });
    });
  });
});
