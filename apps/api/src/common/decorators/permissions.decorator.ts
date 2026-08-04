import { SetMetadata } from '@nestjs/common';

export interface RequiredPermission {
  resource: string;
  action: string;
}

export const PERMISSIONS_KEY = 'permissions';

/**
 * 必要な権限(resource, action)を宣言する。scope(OWN/TEAM/DEPT/ALL)の評価は
 * PermissionsGuard + 各サービスのクエリ絞り込みで行う。
 */
export const RequirePermissions = (...permissions: RequiredPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
