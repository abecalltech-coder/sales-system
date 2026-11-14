import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribePushDto } from './dto/push-subscription.dto';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  /** 同種の通知をまとめて上書きするためのタグ(例: `reminder:<appointmentId>`) */
  tag?: string;
  /** 押すまで消えない通知にする(タスク: 完了・10分後通知・未完了のいずれかを押すまで) */
  requireInteraction?: boolean;
  /** 通知内のボタン(対応端末のみ) */
  actions?: { action: string; title: string }[];
  data?: Record<string, unknown>;
  /** 端末が省電力でも早く届けたい通知(タスク)。Android のスリープ中は normal だと遅れることがある */
  urgency?: 'high' | 'normal';
}

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
    this.enabled = Boolean(publicKey && privateKey);
    if (this.enabled) {
      webpush.setVapidDetails(subject, publicKey!, privateKey!);
    } else {
      this.logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY未設定のため、プッシュ通知は無効化されています');
    }
  }

  getPublicKey() {
    return { publicKey: this.config.get<string>('VAPID_PUBLIC_KEY') ?? null };
  }

  async subscribe(userId: string, dto: SubscribePushDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      create: { userId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
    });
  }

  async unsubscribe(endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return { ok: true };
  }

  /** テスト通知。結果を返して原因切り分けに使う。 */
  async sendTest(userId: string) {
    if (!this.enabled) {
      return { ok: false, reason: 'VAPID_PRIVATE_KEY が未設定のためサーバーから送信できません' };
    }
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) {
      return { ok: false, reason: 'この端末の購読が見つかりません。もう一度「通知を有効にする」を押してください' };
    }
    await Promise.all(
      subs.map((sub) =>
        this.sendToSubscription(sub, {
          title: 'テスト通知',
          body: '通知は正常に届いています',
          url: '/',
          tag: 'push-test',
        }),
      ),
    );
    return { ok: true, sent: subs.length };
  }

  /** 指定ユーザーの全購読先へ送信する。期限切れ購読(410/404)は自動的に削除する */
  /** 送れた端末の数を返す(0 なら届いていない。タスク通知は届くまで次の分も再送するため) */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.enabled) return 0;
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    const results = await Promise.all(subscriptions.map((sub) => this.sendToSubscription(sub, payload)));
    return results.filter(Boolean).length;
  }

  async sendToUsers(userIds: string[], payload: PushPayload) {
    if (!this.enabled || userIds.length === 0) return;
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    await Promise.all(subscriptions.map((sub) => this.sendToSubscription(sub, payload)));
  }

  /**
   * 購読(端末)ごとに送るかどうか・内容を決めて送る(チャットの端末ごとの通知設定用)。
   * build が null を返した購読には送らない。
   */
  async sendToUsersPerSubscription(
    userIds: string[],
    build: (sub: { userId: string; endpoint: string }) => PushPayload | null,
  ) {
    if (!this.enabled || userIds.length === 0) return;
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    await Promise.all(
      subscriptions.map((sub) => {
        const payload = build(sub);
        return payload ? this.sendToSubscription(sub, payload) : undefined;
      }),
    );
  }

  private async sendToSubscription(
    sub: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
  ): Promise<boolean> {
    try {
      const { urgency, ...body } = payload;
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(body),
        urgency ? { urgency } : undefined,
      );
      return true;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // 購読が失効している(ブラウザ側で解除された等) → クリーンアップ
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      } else {
        this.logger.warn(`push send failed: ${(err as Error).message}`);
      }
      return false;
    }
  }
}
