import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { currentPeriodMonth } from '../common/utils/period.util';
import { MonthlySummaryService } from '../monthly-summary/monthly-summary.service';

/**
 * 月次ロールオーバー。実運用ではサマリーは初回アクセス時に遅延生成されるが、
 * 月初にまとめて用意しておく保険として毎月1日 00:05(JST)に当月分を生成する。
 */
@Injectable()
export class MonthlyRolloverService {
  private readonly logger = new Logger(MonthlyRolloverService.name);

  constructor(
    private readonly summary: MonthlySummaryService,
  ) {}

  @Cron('5 0 1 * *', { timeZone: 'Asia/Tokyo' })
  async rollover() {
    const period = currentPeriodMonth();
    try {
      const s = await this.summary.ensureForMonth(period);
      this.logger.log(`月次ロールオーバー完了 ${period}: サマリー ${s.created}件 を生成`);
    } catch (e) {
      this.logger.error(`月次ロールオーバー失敗 ${period}`, e instanceof Error ? e.stack : String(e));
    }
  }
}
