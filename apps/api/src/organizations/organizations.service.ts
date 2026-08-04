import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    return this.prisma.company.create({ data: { name: '株式会社Calltech' } });
  }

  async listDepartments() {
    return this.prisma.department.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
      include: { teams: { where: { active: true }, orderBy: { order: 'asc' } } },
    });
  }

  async createDepartment(dto: CreateDepartmentDto) {
    const company = await this.getOrCreateDefaultCompany();
    return this.prisma.department.create({
      data: { companyId: company.id, name: dto.name, order: dto.order ?? 0 },
    });
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto) {
    const result = await this.prisma.department.updateMany({
      where: { id, version: dto.version },
      data: { name: dto.name, order: dto.order, active: dto.active, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new ConflictException('他のユーザーがこのデータを更新しています');
    }
    return this.prisma.department.findUniqueOrThrow({ where: { id } });
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
