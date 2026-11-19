import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PermissionCode, SystemRole } from '../constants';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  function createMockContext(user?: Partial<AuthenticatedUser>): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow access if no permissions are required by endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ role: 'OPERATOR' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user context is missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PermissionCode.APPS_CREATE]);
    const context = createMockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow access if user has SUPER_ADMIN role (root bypass)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PermissionCode.USERS_DELETE]);
    const context = createMockContext({
      role: SystemRole.SUPER_ADMIN,
      permissions: [],
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if user possesses all required permissions', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([PermissionCode.APPS_CREATE, PermissionCode.APPS_READ]);

    const context = createMockContext({
      role: 'ADMINISTRATOR',
      permissions: [
        PermissionCode.APPS_CREATE,
        PermissionCode.APPS_READ,
        PermissionCode.APPS_UPDATE,
      ],
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user lacks any required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PermissionCode.APPS_DELETE]);

    const context = createMockContext({
      role: 'OPERATOR',
      permissions: [PermissionCode.APPS_READ],
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
