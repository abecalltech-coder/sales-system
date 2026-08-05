import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('masters')
export class MastersController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get('statuses')
  listStatuses(@Query('category') category?: string) {
    return this.prisma.statusMaster.findMany({
      where: { active: true, ...(category ? { category } : {}) },
      orderBy: [{ category: 'asc' }, { order: 'asc' }],
    });
  }

  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get('products')
  listProducts() {
    return this.prisma.product.findMany({ where: { active: true }, orderBy: { order: 'asc' } });
  }

  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get('sources')
  listSources() {
    return this.prisma.source.findMany({ where: { active: true }, orderBy: { order: 'asc' } });
  }
}
