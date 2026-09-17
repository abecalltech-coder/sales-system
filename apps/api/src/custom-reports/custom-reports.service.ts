import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportEngineService } from './report-engine.service';
import { CreateCustomReportDto, ReportConfigDto, UpdateCustomReportDto } from './dto/custom-report.dto';

@Injectable()
export class CustomReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ReportEngineService,
  ) {}

  list() {
    return this.prisma.customReport.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  }

  async get(id: string) {
    const report = await this.prisma.customReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('レポートが見つかりません');
    const rows = await this.engine.computeRows(report.config as unknown as ReportConfigDto);
    return { ...report, rows };
  }

  async create(dto: CreateCustomReportDto, userId?: string) {
    const max = await this.prisma.customReport.aggregate({ _max: { order: true } });
    return this.prisma.customReport.create({
      data: {
        name: dto.name,
        config: dto.config as unknown as object,
        order: (max._max.order ?? 0) + 1,
        createdBy: userId,
      },
    });
  }

  async update(id: string, dto: UpdateCustomReportDto) {
    const existing = await this.prisma.customReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('レポートが見つかりません');
    return this.prisma.customReport.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.config !== undefined ? { config: dto.config as unknown as object } : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.customReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('レポートが見つかりません');
    await this.prisma.customReport.delete({ where: { id } });
    return { ok: true };
  }

  preview(config: ReportConfigDto) {
    return this.engine.computeRows(config);
  }
}
