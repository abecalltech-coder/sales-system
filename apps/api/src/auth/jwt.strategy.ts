import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, AuthenticatedUser } from './types';

function cookieExtractor(req: Request): string | null {
  return req?.cookies?.access_token ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-insecure-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
      },
    });

    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('ユーザーが無効です');
    }

    const roles = user.roles.map((ur) => ur.role.code);
    const permissions = user.roles.flatMap((ur) =>
      ur.role.permissions.map((p) => ({ resource: p.resource, action: p.action, scope: p.scope })),
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      departmentId: user.departmentId,
      teamId: user.teamId,
      roles,
      permissions,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
