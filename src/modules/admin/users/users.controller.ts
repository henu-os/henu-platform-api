import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/common/auth/guards/permissions.guard';
import { PrismaService } from '@/prisma/prisma.service';

@ApiTags('Admin - Users & Roles Management')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin')
export class UsersManagementController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('users')
  @ApiOperation({ summary: 'List all authorized administrative operators' })
  @ApiResponse({ status: 200, description: 'List of admin users' })
  async listUsers() {
    const users = await this.prisma.adminUser.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        isActive: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : undefined,
    }));
  }

  @Get('roles')
  @ApiOperation({ summary: 'List all system security roles and granted permissions' })
  @ApiResponse({ status: 200, description: 'List of system roles' })
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions.map((rp: { permission: { code: string } }) => rp.permission.code),
    }));
  }

  @Get('channels')
  @ApiOperation({ summary: 'List all release distribution channels' })
  @ApiResponse({ status: 200, description: 'List of distribution channels' })
  async listChannels() {
    const channels = await this.prisma.releaseChannel.findMany({
      orderBy: { name: 'asc' },
    });

    return channels.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      isDefault: c.isDefault,
    }));
  }
}
