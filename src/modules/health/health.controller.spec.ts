import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '@/prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;

  const mockPrismaService = {
    $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkLiveness', () => {
    it('should return status ok and uptime', () => {
      const result = controller.checkLiveness();
      expect(result.status).toBe('ok');
      expect(typeof result.uptimeSeconds).toBe('number');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('checkReadiness', () => {
    it('should report database connected when query succeeds', async () => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce([{ 1: 1 }]);
      const result = await controller.checkReadiness();
      expect(result.status).toBe('ok');
      expect(result.services.database).toBe('connected');
    });

    it('should report degraded status when database is unreachable', async () => {
      mockPrismaService.$queryRaw.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await controller.checkReadiness();
      expect(result.status).toBe('degraded');
      expect(result.services.database).toContain('unavailable');
    });
  });
});
