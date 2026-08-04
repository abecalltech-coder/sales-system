export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  departmentId: string | null;
  teamId: string | null;
  roles: string[]; // Role.code の配列
  permissions: { resource: string; action: string; scope: string }[];
  mustChangePassword: boolean;
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  type: 'access';
  iat?: number;
  exp?: number;
}
