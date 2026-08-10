import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

/**
 * CLカレンダーのリマインド送信(セクション追加要望)。
 * BullMQ+Redis等の追加インフラは使わず、毎分のCronで「送信済みでない・通知時刻に
 * 達した」予定を拾って担当者へプッシュ通知する軽量な仕組みにしている。
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sendDueReminders() {
    const now = new Date();

    const candidates = await this.prisma.appointment.findMany({
      where: {
        deletedAt: null,
        reminderEnabled: true,
        reminderSentAt: null,
        meetingStartAt: { gt: now },
        meetingUserId: { not: null },
      },
      include: { customer: true },
    });

    for (const appt of candidates) {
      if (!appt.meetingStartAt || !appt.reminderMinutesBefore || !appt.meetingUserId) continue;
      const dueAt = new Date(appt.meetingStartAt.getTime() - appt.reminderMinutesBefore * 60_000);
      if (dueAt > now) continue;

      try {
        await this.push.sendToUser(appt.meetingUserId, {
          title: 'まもなく商談です',
          body: `${appt.customer?.corporateName ?? '店舗名未設定'} - ${appt.meetingStartAt.toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            hour: '2-digit',
            minute: '2-digit',
          })}`,
          url: '/cl-calendar',
        });
      } catch (err) {
        this.logger.warn(`reminder send failed for appointment=${appt.id}: ${(err as Error).message}`);
      } finally {
        await this.prisma.appointment.update({ where: { id: appt.id }, data: { reminderSentAt: now } });
      }
    }
  }
}
