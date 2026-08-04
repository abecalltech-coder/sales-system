import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY, RequiredPermission } from '../decorators/permissions.decorator';
import { AuthenticatedUser } from '../../auth/types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('認証が必要です');

    // SUPER_ADMIN/ADMINは全許可(初期ロール)。それ以外はPermissionテーブルで判定。
    if (user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN')) return true;

    const ok = required.every((req) =>
      user.permissions.some((p) => p.resource === req.resource && p.action === req.action),
    );
    if (!ok) throw new ForbiddenException('この操作を行う権限がありません');

    // scope(OWN/TEAM/DEPT/ALL)の絞り込みは各サービスのクエリ側で
    // user.departmentId / user.teamId / user.id を使って適用する。
    return true;
  }
}
