import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Application } from '@prisma/client';
import { CreateApplicationDto, ApplicationResponseDto } from './dto/application.dto';

@Injectable()
export class AdminService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async listApplications(
    page = 1,
    limit = 20,
  ): Promise<{
    data: ApplicationResponseDto[];
    meta: { total: number; page: number; limit: number };
  }> {
    if (!this.prisma) {
      return { data: [], meta: { total: 0, page, limit } };
    }

    try {
      const skip = (page - 1) * limit;
      const [total, records] = await Promise.all([
        this.prisma.application.count({ where: { deletedAt: null } }),
        this.prisma.application.findMany({
          where: { deletedAt: null },
          skip,
          take: limit,
          orderBy: { sortOrder: 'asc' },
        }),
      ]);

      return {
        data: records.map(this.mapToResponseDto),
        meta: { total, page, limit },
      };
    } catch {
      return { data: [], meta: { total: 0, page, limit } };
    }
  }

  async getApplicationById(id: string): Promise<ApplicationResponseDto> {
    if (!this.prisma) {
      throw new NotFoundException(`Application with ID '${id}' not found.`);
    }

    const app = await this.prisma.application.findFirst({
      where: { id, deletedAt: null },
    });

    if (!app) {
      throw new NotFoundException(`Application with ID '${id}' not found.`);
    }

    return this.mapToResponseDto(app);
  }

  async createApplication(dto: CreateApplicationDto): Promise<ApplicationResponseDto> {
    if (!this.prisma) {
      throw new Error('Database service unavailable.');
    }

    const existing = await this.prisma.application.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(`Application with slug '${dto.slug}' already exists.`);
    }

    const created = await this.prisma.application.create({
      data: {
        slug: dto.slug,
        displayName: dto.displayName,
        summary: dto.summary,
        description: dto.description,
        category: dto.category,
        developer: dto.developer ?? 'HENU OS PRIVATE LIMITED',
        iconUrl: dto.iconUrl,
        bannerUrl: dto.bannerUrl,
        homepageUrl: dto.homepageUrl,
        docsUrl: dto.docsUrl,
        license: dto.license ?? 'Proprietary',
        status: dto.status ?? 'DRAFT',
        featured: dto.featured ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    return this.mapToResponseDto(created);
  }

  private mapToResponseDto(app: Application): ApplicationResponseDto {
    return {
      id: app.id,
      slug: app.slug,
      displayName: app.displayName,
      summary: app.summary,
      description: app.description,
      category: app.category,
      developer: app.developer,
      iconUrl: app.iconUrl,
      bannerUrl: app.bannerUrl,
      homepageUrl: app.homepageUrl,
      docsUrl: app.docsUrl,
      license: app.license,
      status: app.status,
      featured: app.featured,
      sortOrder: app.sortOrder,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    };
  }
}
