export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  departmentId: string | null;
  teamId: string | null;
  roles: string[]; // Role.code の配列
  permissions: { resource: string; action: string; scope: string }[];
  // 表示できるナビタブのパス一覧。nullは制限なし(全タブ表示)。
  visibleTabs: string[] | null;
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  type: 'access';
  iat?: number;
  exp?: number;
}
