import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { FinalReportsService, jstDateKey } from './final-reports.service';

/**
 * 最終報告の19:00未入力アラート(要望)。
 * 出勤日(シフト表で当日の稼働時間>0)なのに当日の最終報告が未入力のユーザーがいたら、
 * 責任者(MANAGER) + 管理者(ADMIN/SUPER_ADMIN)へまとめてプッシュ通知する。本人には送らない。
 */
@Injectable()
export class FinalReportsAlertService {
  private readonly logger = new Logger(FinalReportsAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: FinalReportsService,
    private readonly push: PushNotificationsService,
  ) {}

  @Cron('0 19 * * *', { timeZone: 'Asia/Tokyo' })
  async notifyUnreported() {
    const date = jstDateKey();
    try {
      const unreported = await this.reports.findUnreported(date);
      if (unreported.length === 0) {
        this.logger.log(`最終報告アラート ${date}: 未入力なし`);
        return;
      }

      const managers = await this.prisma.user.findMany({
        where: {
          deletedAt: null,
          roles: { some: { role: { code: { in: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] } } } },
        },
        select: { id: true },
      });
      const names = unreported.map((u) => u.name).join('、');
      await this.push.sendToUsers(
        managers.map((m) => m.id),
        {
          title: '最終報告 未入力あり',
          body: `${date} 出勤日にもかかわらず最終報告が未入力です: ${names}`,
          url: '/final-report',
          tag: `final-report-alert:${date}`,
        },
      );
      this.logger.log(`最終報告アラート ${date}: ${unreported.length}名未入力 → 責任者/管理者 ${managers.length}名へ通知`);
    } catch (e) {
      this.logger.error(`最終報告アラート失敗 ${date}`, e instanceof Error ? e.stack : String(e));
    }
  }
}
