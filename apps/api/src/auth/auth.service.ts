import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './types';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 14;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async login(email: string, password: string, ip: string | undefined) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.deletedAt) {
      await this.recordAudit(null, 'LOGIN_FAILED', ip, false, `unknown or deleted user: ${email}`);
      throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('アカウントが一時的にロックされています。しばらくしてから再試行してください');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const failedCount = user.failedLoginCount + 1;
      const shouldLock = failedCount >= MAX_FAILED_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: shouldLock ? 0 : failedCount,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
        },
      });
      await this.recordAudit(user.id, 'LOGIN_FAILED', ip, false, 'invalid password');
      throw new UnauthorizedException('メールアドレスまたはパスワードが正しくありません');
    }

    // パスワード確認後にのみ在籍状態を判定する(未承認/停止であることをパスワード未入力の第三者に知らせないため)
    if (user.status === 'PENDING') {
      await this.recordAudit(user.id, 'LOGIN_FAILED', ip, false, 'pending approval');
      throw new UnauthorizedException('アカウントは管理者の承認待ちです。承認され次第ログインできます');
    }
    if (user.status !== 'ACTIVE') {
      await this.recordAudit(user.id, 'LOGIN_FAILED', ip, false, `inactive status: ${user.status}`);
      throw new UnauthorizedException('このアカウントは現在ご利用いただけません。管理者にお問い合わせください');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const accessToken = this.signAccessToken(user.id, user.email);
    const refreshToken = await this.issueRefreshToken(user.id, ip);

    await this.recordAudit(user.id, 'LOGIN_SUCCESS', ip, true);

    return { accessToken, refreshToken };
  }

  signAccessToken(userId: string, email: string): string {
    const payload: JwtPayload = { sub: userId, email, type: 'access' };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-insecure-secret',
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  async issueRefreshToken(userId: string, ip: string | undefined): Promise<string> {
    const raw = randomUUID() + randomUUID();
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, createdByIp: ip },
    });

    return raw;
  }

  async refresh(rawToken: string | undefined, ip: string | undefined) {
    if (!rawToken) throw new UnauthorizedException('リフレッシュトークンがありません');
    const tokenHash = this.hashToken(rawToken);

    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      // 失効済み/不明なトークンの再利用は再利用攻撃の可能性があるため、
      // 該当ユーザーの全セッションを失効させる。
      if (stored?.userId) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException('リフレッシュトークンが無効です');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('ユーザーが無効です');
    }

    // ローテーション: 旧トークンを失効させ新トークンを発行
    const newRawToken = await this.issueRefreshToken(user.id, ip);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedBy: this.hashToken(newRawToken) },
    });

    const accessToken = this.signAccessToken(user.id, user.email);
    return { accessToken, refreshToken: newRawToken };
  }

  async logout(rawToken: string | undefined, userId?: string) {
    if (rawToken) {
      const tokenHash = this.hashToken(rawToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (userId) await this.recordAudit(userId, 'LOGOUT', undefined, true);
  }

  private async recordAudit(
    actorUserId: string | null,
    action: string,
    ip: string | undefined,
    success: boolean,
    errorMessage?: string,
  ) {
    await this.prisma.auditLog.create({
      data: { actorUserId: actorUserId ?? undefined, action, ipAddress: ip, success, errorMessage },
    });
  }
}
