import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Department } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
  CreateTeamDto,
  UpdateTeamDto,
} from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 会社は1社構成を前提とし、なければ作成して返す(セクション6の階層: 会社>部署>チーム>ユーザー) */
  private async getOrCreateDefaultCompany() {
    const existing = await this.prisma.company.findFirst();
    if (existing) return existing;
    return this.prisma.company.create({ data: { name: 'CH partners' } });
  }

  async listDepartments() {
    return this.prisma.department.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
      include: { teams: { where: { active: true }, orderBy: { order: 'asc' } }, company: { select: { name: true } } },
    });
  }

  async createDepartment(dto: CreateDepartmentDto) {
    const company = await this.getOrCreateDefaultCompany();
    // 追加した部署は一番下へ
    const max = await this.prisma.department.aggregate({ where: { active: true }, _max: { order: true } });
    const name = dto.name.trim();
    const created = await this.prisma.department.create({
      data: { companyId: company.id, name, order: dto.order ?? (max._max.order ?? 0) + 1 },
    });
    return this.syncBranch(created);
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto) {
    const result = await this.prisma.department.updateMany({
      where: { id, version: dto.version },
      data: { name: dto.name?.trim(), order: dto.order, active: dto.active, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new ConflictException('他のユーザーがこのデータを更新しています');
    }
    return this.syncBranch(await this.prisma.department.findUniqueOrThrow({ where: { id } }));
  }

  /**
   * マスタの部署(DEPARTMENT_BRANCH: トス/アポ詳細の部署・カレンダー題名・色・月次サマリー)を組織管理に合わせる。
   * 要望: 組織設定に関わるものを1か所(組織管理)で変更・統一する。色はマスタ管理側で持つ。
   */
  private async syncBranch(dept: Department) {
    const data = { displayName: dept.name, order: dept.order, active: dept.active };
    const linked = dept.branchStatusId ? await this.prisma.statusMaster.findUnique({ where: { id: dept.branchStatusId } }) : null;
    if (linked) {
      await this.prisma.statusMaster.update({ where: { id: linked.id }, data });
      return dept;
    }
    // 未紐づけなら同名の部署マスタを使い、無ければ作る
    const sameName = await this.prisma.statusMaster.findFirst({
      where: { category: 'DEPARTMENT_BRANCH', displayName: dept.name, NOT: { id: { in: await this.linkedBranchIds() } } },
      orderBy: [{ active: 'desc' }, { order: 'asc' }],
    });
    const branch = sameName
      ? await this.prisma.statusMaster.update({ where: { id: sameName.id }, data })
      : await this.prisma.statusMaster.create({ data: { category: 'DEPARTMENT_BRANCH', internalCode: `DEPT_${dept.id.slice(0, 8)}`, ...data } });
    return this.prisma.department.update({ where: { id: dept.id }, data: { branchStatusId: branch.id } });
  }

  private async linkedBranchIds() {
    const rows = await this.prisma.department.findMany({ where: { branchStatusId: { not: null } }, select: { branchStatusId: true } });
    return rows.map((r) => r.branchStatusId!);
  }

  async createTeam(dto: CreateTeamDto) {
    const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!department) throw new NotFoundException('部署が見つかりません');
    return this.prisma.team.create({
      data: { departmentId: dto.departmentId, name: dto.name, order: dto.order ?? 0 },
    });
  }

  async updateTeam(id: string, dto: UpdateTeamDto) {
    const result = await this.prisma.team.updateMany({
      where: { id, version: dto.version },
      data: { name: dto.name, order: dto.order, active: dto.active, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new ConflictException('他のユーザーがこのデータを更新しています');
    }
    return this.prisma.team.findUniqueOrThrow({ where: { id } });
  }
}
