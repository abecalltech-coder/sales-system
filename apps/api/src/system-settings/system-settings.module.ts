import { Body, Controller, Get, Injectable, Module, Param, Put } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { IsNotEmpty } from 'class-validator';

// セクション40等で参照される既定のシステム設定キー一覧(値は管理画面から変更可能)
const DEFAULT_SETTINGS: Record<string, unknown> = {
  arrivalWarningDistanceMeters: 500,
  visitLateThresholdMinutes: 15,
  visitReminderMinutesBefore: 30,
  requireDelayReason: true,
  duplicateCustomerRule: 'ADMIN_REVIEW',
};

class SetSettingDto {
  @IsNotEmpty()
  value!: unknown;
}

@Injectable()
class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.systemSetting.findMany();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return Object.entries(DEFAULT_SETTINGS).map(([key, defaultValue]) => ({
      key,
      value: map.has(key) ? map.get(key) : defaultValue,
    }));
  }

  async set(key: string, value: unknown) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  }
}

@Controller('system-settings')
class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @RequirePermissions({ resource: 'system', action: 'view' })
  @Get()
  list() {
    return this.service.list();
  }

  @RequirePermissions({ resource: 'system', action: 'edit' })
  @Put(':key')
  set(@Param('key') key: string, @Body() dto: SetSettingDto) {
    return this.service.set(key, dto.value);
  }
}

@Module({
  providers: [SystemSettingsService],
  controllers: [SystemSettingsController],
})
export class SystemSettingsModule {}
