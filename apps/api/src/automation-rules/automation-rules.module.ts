import { Injectable, NotFoundException } from '@nestjs/common';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAutomationRuleDto, UpdateAutomationRuleDto } from './dto/automation-rule.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Injectable()
class AutomationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(statusMasterId?: string) {
    return this.prisma.statusAutomationRule.findMany({ where: statusMasterId ? { statusMasterId } : {} });
  }

  create(dto: CreateAutomationRuleDto) {
    return this.prisma.statusAutomationRule.create({
      data: { statusMasterId: dto.statusMasterId, action: dto.action, config: dto.config ?? {} },
    });
  }

  async update(id: string, dto: UpdateAutomationRuleDto) {
    const existing = await this.prisma.statusAutomationRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('自動処理ルールが見つかりません');
    return this.prisma.statusAutomationRule.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.statusAutomationRule.delete({ where: { id } });
    return { ok: true };
  }
}

@Controller('automation-rules')
class AutomationRulesController {
  constructor(private readonly service: AutomationRulesService) {}

  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get()
  list(@Query('statusMasterId') statusMasterId?: string) {
    return this.service.list(statusMasterId);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post()
  create(@Body() dto: CreateAutomationRuleDto) {
    return this.service.create(dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAutomationRuleDto) {
    return this.service.update(id, dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({
  providers: [AutomationRulesService],
  controllers: [AutomationRulesController],
})
export class AutomationRulesModule {}
