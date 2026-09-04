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

  /** 指定ユーザーの全購読先へ送信する。期限切れ購読(410/404)は自動的に削除する */
  async sendToUser(userId: string, payload: PushPayload) {
    if (!this.enabled) return;
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    await Promise.all(subscriptions.map((sub) => this.sendToSubscription(sub, payload)));
  }

  async sendToUsers(userIds: string[], payload: PushPayload) {
    if (!this.enabled || userIds.length === 0) return;
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    await Promise.all(subscriptions.map((sub) => this.sendToSubscription(sub, payload)));
  }

  private async sendToSubscription(
    sub: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
  ) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // 購読が失効している(ブラウザ側で解除された等) → クリーンアップ
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      } else {
        this.logger.warn(`push send failed: ${(err as Error).message}`);
      }
    }
  }
}
