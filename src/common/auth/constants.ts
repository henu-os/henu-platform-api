export enum SystemRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMINISTRATOR = 'ADMINISTRATOR',
  RELEASE_MANAGER = 'RELEASE_MANAGER',
  OPERATOR = 'OPERATOR',
  AUDITOR = 'AUDITOR',
}

export enum PermissionCode {
  // Application permissions
  APPS_CREATE = 'apps:create',
  APPS_READ = 'apps:read',
  APPS_UPDATE = 'apps:update',
  APPS_DELETE = 'apps:delete',
  APPS_ARCHIVE = 'apps:archive',

  // Platform Compatibility
  COMPAT_MANAGE = 'compat:manage',

  // Repository permissions
  REPOS_CREATE = 'repos:create',
  REPOS_READ = 'repos:read',
  REPOS_UPDATE = 'repos:update',
  REPOS_DELETE = 'repos:delete',
  REPOS_SYNC = 'repos:sync',

  // Releases
  RELEASES_CREATE = 'releases:create',
  RELEASES_READ = 'releases:read',
  RELEASES_UPDATE = 'releases:update',
  RELEASES_PUBLISH = 'releases:publish',
  RELEASES_REVOKE = 'releases:revoke',

  // Catalogue
  CATALOGUE_READ = 'catalogue:read',
  CATALOGUE_PUBLISH = 'catalogue:publish',
  CATALOGUE_ROLLBACK = 'catalogue:rollback',

  // User Management
  USERS_READ = 'users:read',
  USERS_CREATE = 'users:create',
  USERS_UPDATE = 'users:update',
  USERS_DELETE = 'users:delete',

  // Audit Logs
  AUDIT_READ = 'audit:read',

  // Webhook management
  WEBHOOKS_READ = 'webhooks:read',
  WEBHOOKS_WRITE = 'webhooks:write',
}

export const ROLE_DEFAULT_PERMISSIONS: Record<SystemRole, PermissionCode[]> = {
  [SystemRole.SUPER_ADMIN]: Object.values(PermissionCode),

  [SystemRole.ADMINISTRATOR]: [
    PermissionCode.APPS_CREATE,
    PermissionCode.APPS_READ,
    PermissionCode.APPS_UPDATE,
    PermissionCode.APPS_DELETE,
    PermissionCode.APPS_ARCHIVE,
    PermissionCode.COMPAT_MANAGE,
    PermissionCode.REPOS_CREATE,
    PermissionCode.REPOS_READ,
    PermissionCode.REPOS_UPDATE,
    PermissionCode.REPOS_DELETE,
    PermissionCode.REPOS_SYNC,
    PermissionCode.RELEASES_CREATE,
    PermissionCode.RELEASES_READ,
    PermissionCode.RELEASES_UPDATE,
    PermissionCode.RELEASES_PUBLISH,
    PermissionCode.RELEASES_REVOKE,
    PermissionCode.CATALOGUE_READ,
    PermissionCode.CATALOGUE_PUBLISH,
    PermissionCode.CATALOGUE_ROLLBACK,
    PermissionCode.USERS_READ,
    PermissionCode.USERS_CREATE,
    PermissionCode.USERS_UPDATE,
    PermissionCode.AUDIT_READ,
    PermissionCode.WEBHOOKS_READ,
    PermissionCode.WEBHOOKS_WRITE,
  ],

  [SystemRole.RELEASE_MANAGER]: [
    PermissionCode.APPS_READ,
    PermissionCode.REPOS_READ,
    PermissionCode.REPOS_SYNC,
    PermissionCode.RELEASES_CREATE,
    PermissionCode.RELEASES_READ,
    PermissionCode.RELEASES_UPDATE,
    PermissionCode.RELEASES_PUBLISH,
    PermissionCode.RELEASES_REVOKE,
    PermissionCode.CATALOGUE_READ,
    PermissionCode.CATALOGUE_PUBLISH,
    PermissionCode.CATALOGUE_ROLLBACK,
    PermissionCode.WEBHOOKS_READ,
  ],

  [SystemRole.OPERATOR]: [
    PermissionCode.APPS_READ,
    PermissionCode.APPS_UPDATE,
    PermissionCode.REPOS_READ,
    PermissionCode.REPOS_SYNC,
    PermissionCode.RELEASES_READ,
    PermissionCode.CATALOGUE_READ,
    PermissionCode.WEBHOOKS_READ,
    PermissionCode.WEBHOOKS_WRITE,
  ],

  [SystemRole.AUDITOR]: [
    PermissionCode.APPS_READ,
    PermissionCode.REPOS_READ,
    PermissionCode.RELEASES_READ,
    PermissionCode.CATALOGUE_READ,
    PermissionCode.USERS_READ,
    PermissionCode.AUDIT_READ,
    PermissionCode.WEBHOOKS_READ,
  ],
};
