import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApproveUserDto } from './dto/approve-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { page: number; pageSize: number; keyword?: string; departmentId?: string; status?: string }) {
    const { page, pageSize, keyword, departmentId, status } = params;
    const where = {
      deletedAt: null,
      ...(departmentId ? { departmentId } : {}),
      ...(status ? { status: status as 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'RETIRED' } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' as const } },
              { email: { contains: keyword, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          email: true,
          name: true,
          employeeCode: true,
          departmentId: true,
          teamId: true,
          status: true,
          version: true,
          roles: { select: { role: { select: { code: true, name: true } } } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('ユーザーが見つかりません');
    return user;
  }

  /** 管理者によるユーザー作成。初回パスワードはランダム発行し、初回ログイン時変更必須にする。 */
  async create(dto: CreateUserDto) {
    const tempPassword = randomBytes(9).toString('base64url'); // 招待用の一時パスワード
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const roles = await this.prisma.role.findMany({ where: { code: { in: dto.roleCodes } } });
    if (roles.length !== dto.roleCodes.length) {
      throw new NotFoundException('指定されたロールの一部が存在しません');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        employeeCode: dto.employeeCode,
        departmentId: dto.departmentId,
        teamId: dto.teamId,
        passwordHash,
        mustChangePassword: true,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
    });

    // 一時パスワードは呼び出し元(管理画面)にのみ返す。ログや監査ログには残さない。
    return { user, tempPassword };
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('ユーザーが見つかりません');

    if (existing.version !== dto.version) {
      throw new ConflictException({
        message: '他のユーザーがこのデータを更新しています。最新の内容を確認してください。',
        latest: await this.findOne(id),
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id, version: dto.version },
        data: {
          name: dto.name,
          departmentId: dto.departmentId,
          teamId: dto.teamId,
          status: dto.status,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictException('他のユーザーがこのデータを更新しています');
      }

      if (dto.roleCodes) {
        const roles = await tx.role.findMany({ where: { code: { in: dto.roleCodes } } });
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roles.map((r) => ({ userId: id, roleId: r.id })),
        });
      }

      return tx.user.findUniqueOrThrow({ where: { id }, include: { roles: { include: { role: true } } } });
    });

    return result;
  }

  /** 管理者によるパスワード再設定。次回ログイン時の変更を必須にする。 */
  async resetPassword(id: string) {
    const tempPassword = randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { tempPassword };
  }

  /** 退職者などは物理削除せず論理削除する(セクション36) */
  async softDelete(id: string) {
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'RETIRED' } });
    return { ok: true };
  }

  /** 自己登録ユーザーの承認(セクション追加要望)。所属・ロールを設定してACTIVE化する。 */
  async approve(id: string, dto: ApproveUserDto) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null, status: 'PENDING' } });
    if (!user) throw new NotFoundException('承認待ちのユーザーが見つかりません');

    const roles = await this.prisma.role.findMany({ where: { code: { in: dto.roleCodes } } });
    if (roles.length !== dto.roleCodes.length) {
      throw new NotFoundException('指定されたロールの一部が存在しません');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          departmentId: dto.departmentId,
          teamId: dto.teamId,
          version: { increment: 1 },
        },
      });
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });
      return tx.user.findUniqueOrThrow({ where: { id }, include: { roles: { include: { role: true } } } });
    });
  }

  /** 自己登録ユーザーの却下(セクション追加要望)。在籍者の停止とは区別し、承認待ちのみ対象にする。 */
  async reject(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null, status: 'PENDING' } });
    if (!user) throw new NotFoundException('承認待ちのユーザーが見つかりません');

    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'RETIRED' } });
    return { ok: true };
  }
}
