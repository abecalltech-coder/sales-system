import { Body, Controller, Get, Injectable, Module, Param, Put } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { IsNotEmpty } from 'class-validator';

// トス→アポイント自動作成時に備考欄(アポ実績・CLカレンダー詳細で共用)へ流し込むテンプレート。
// {{token}}部分だけ実データに置換され、それ以外はそのまま雛形として残る(要望:
// このフォーマットをマスタ管理から都度変更できるようにしたい)。
const DEFAULT_TOSS_APPOINTMENT_MEMO_TEMPLATE = `獲得角度：{{acquisitionAngle}}
取り次ぎ日時：{{nextActionAt}}
商談日時：{{meetingAt}}
店舗名：{{storeName}}
住所：{{address}}
業種：{{industry}}
店舗番号：{{storePhone}}
携帯番号：
担当者名：{{contactName}}様　歳前後　男性/女性
対応者：オーナー
利用電気：
アポインター：{{apStaffName}}
前確者：{{preConfirmName}}
料金：
明細準備：WEB/紙
法人or屋号：法人/屋号
対象外確認：済/未
地点数：従量（地点）/動力（地点）
支払方法、印鑑・支払情報の準備：無
提案：店舗/自宅/事務所
リスト名：{{listName}}
前連：{{preContactAt}}
フック：{{hook}}
SMS送付番号(orメアド)：
店舗HPのURL：
HP：
GoogleMeetURL：{{meetingUrl}}
備考：`;

// Googleフォーム経由でトス案件が作成された際の備考欄テンプレート(要望: 下記の項目名で改行されるように)。
const DEFAULT_GOOGLE_FORM_TOSS_MEMO_TEMPLATE = `店舗番号：{{storePhone}}
店舗名：{{storeName}}
住所：{{address}}
業種：{{industry}}
オーナー名：{{ownerName}}
SMS送付番号(オーナー番号)：{{smsNumber}}
リスト名：{{listName}}
HP有無：{{hpStatus}}
時節：{{season}}
備考：{{memo}}
前確架電先番号：{{preConfirmPhone}}
デモサイト：{{demoSite}}`;

// セクション40等で参照される既定のシステム設定キー一覧(値は管理画面から変更可能)
const DEFAULT_SETTINGS: Record<string, unknown> = {
  arrivalWarningDistanceMeters: 500,
  visitLateThresholdMinutes: 15,
  visitReminderMinutesBefore: 30,
  requireDelayReason: true,
  duplicateCustomerRule: 'ADMIN_REVIEW',
  tossAppointmentMemoTemplate: DEFAULT_TOSS_APPOINTMENT_MEMO_TEMPLATE,
  googleFormTossMemoTemplate: DEFAULT_GOOGLE_FORM_TOSS_MEMO_TEMPLATE,
};

class SetSettingDto {
  @IsNotEmpty()
  value!: unknown;
}

@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.systemSetting.findMany();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return Object.entries(DEFAULT_SETTINGS).map(([key, defaultValue]) => ({
      key,
      value: map.has(key) ? map.get(key) : defaultValue,
    }));
  }

  /** 他モジュールから1件だけ値を参照したい場合用(例: トス→アポ自動作成時のテンプレート取得) */
  async getOne(key: string): Promise<unknown> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row ? row.value : DEFAULT_SETTINGS[key];
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
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
