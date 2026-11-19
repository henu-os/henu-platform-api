import { PrismaClient } from '@prisma/client';
import { CryptoUtil } from '../common/auth/crypto.util';
import { SystemRole, PermissionCode, ROLE_DEFAULT_PERMISSIONS } from '../common/auth/constants';

async function main() {
  const prisma = new PrismaClient();

  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const fullName = process.env.INITIAL_ADMIN_NAME || 'System Super Administrator';

  if (!email || !password) {
    console.error(
      '❌ ERROR: INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD environment variables are required.',
    );
    console.error(
      'Usage: INITIAL_ADMIN_EMAIL="admin@henuos.com" INITIAL_ADMIN_PASSWORD="StrongPassword123!" npm run seed:admin',
    );
    process.exit(1);
  }

  if (password.length < 10) {
    console.error('❌ ERROR: INITIAL_ADMIN_PASSWORD must be at least 10 characters in length.');
    process.exit(1);
  }

  console.log('🔄 Seeding standard roles and permissions...');

  // 1. Seed Permissions
  const permissionMap = new Map<string, string>();
  for (const code of Object.values(PermissionCode)) {
    const category = code.split(':')[0].toUpperCase();
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { category },
      create: {
        code,
        category,
        description: `Permission for ${code}`,
      },
    });
    permissionMap.set(code, permission.id);
  }

  // 2. Seed Roles and RolePermissions
  const roleMap = new Map<string, string>();
  for (const roleName of Object.values(SystemRole)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { isSystem: true },
      create: {
        name: roleName,
        description: `System role ${roleName}`,
        isSystem: true,
      },
    });
    roleMap.set(roleName, role.id);

    // Assign permissions
    const permissionsForRole = ROLE_DEFAULT_PERMISSIONS[roleName] || [];
    for (const permCode of permissionsForRole) {
      const permId = permissionMap.get(permCode);
      if (permId) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permId,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permId,
          },
        });
      }
    }
  }

  // 3. Create Super Admin User
  const superAdminRoleId = roleMap.get(SystemRole.SUPER_ADMIN);
  if (!superAdminRoleId) {
    throw new Error('SUPER_ADMIN role not found after seeding.');
  }

  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email },
  });

  const passwordHash = await CryptoUtil.hashPassword(password);

  if (existingAdmin) {
    await prisma.adminUser.update({
      where: { id: existingAdmin.id },
      data: {
        passwordHash,
        fullName,
        roleId: superAdminRoleId,
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    console.log(`✅ Super Admin '${email}' password and role updated successfully.`);
  } else {
    const createdAdmin = await prisma.adminUser.create({
      data: {
        email,
        passwordHash,
        fullName,
        roleId: superAdminRoleId,
        isActive: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminUserId: createdAdmin.id,
        actorEmail: email,
        ipAddress: '127.0.0.1',
        userAgent: 'CLI / seed:admin',
        action: 'INITIAL_ADMIN_PROVISIONED',
        entityType: 'AdminUser',
        entityId: createdAdmin.id,
        payload: { email, role: SystemRole.SUPER_ADMIN },
      },
    });

    console.log(`✅ Super Admin '${email}' provisioned successfully.`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Error during initial admin provisioning:', err);
  process.exit(1);
});
