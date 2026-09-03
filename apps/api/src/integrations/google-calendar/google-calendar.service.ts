import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptToken, encryptToken } from '../../common/utils/token-crypto.util';

const PROVIDER = 'google_calendar';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ');

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** OAuthクライアント設定。env未設定なら null(= 連携設定ページで「未設定」と表示する) */
  private config(): OAuthConfig | null {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      (process.env.API_URL ? `${process.env.API_URL}/api/integrations/google-calendar/callback` : '');
    if (!clientId || !clientSecret || !redirectUri) return null;
    return { clientId, clientSecret, redirectUri };
  }

  async getStatus() {
    const cfg = this.config();
    const row = await this.prisma.googleIntegration.findUnique({ where: { provider: PROVIDER } });
    return {
      configured: Boolean(cfg),
      connected: Boolean(row?.refreshToken),
      accountEmail: row?.accountEmail ?? null,
      connectedAt: row?.connectedAt ?? null,
      calendarId: row?.calendarId ?? 'primary',
      redirectUri: cfg?.redirectUri ?? null,
    };
  }

  getAuthUrl(): string {
    const cfg = this.config();
    if (!cfg) throw new BadRequestException('Google OAuthのCLIENT_ID/SECRET/REDIRECT_URIが未設定です');
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(code: string, connectedById?: string): Promise<void> {
    const cfg = this.config();
    if (!cfg) throw new BadRequestException('Google OAuthが未設定です');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      this.logger.error(`token exchange failed: ${t}`);
      throw new BadRequestException('Googleの認証に失敗しました');
    }
    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };

    let accountEmail: string | null = null;
    try {
      const meRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (meRes.ok) accountEmail = ((await meRes.json()) as { email?: string }).email ?? null;
    } catch {
      /* email取得は必須ではない */
    }

    const expiry = new Date(Date.now() + (token.expires_in - 60) * 1000);
    const existing = await this.prisma.googleIntegration.findUnique({ where: { provider: PROVIDER } });
    // 再連携でrefresh_tokenが返らないことがあるため、その場合は既存を維持する
    const refreshToken = token.refresh_token
      ? encryptToken(token.refresh_token)
      : existing?.refreshToken ?? null;
    if (!refreshToken) {
      throw new BadRequestException('リフレッシュトークンが取得できませんでした。一度連携解除してから再度お試しください');
    }

    await this.prisma.googleIntegration.upsert({
      where: { provider: PROVIDER },
      update: {
        accountEmail,
        accessToken: encryptToken(token.access_token),
        refreshToken,
        tokenExpiry: expiry,
        scope: token.scope ?? SCOPES,
        connectedById,
        connectedAt: new Date(),
      },
      create: {
        provider: PROVIDER,
        accountEmail,
        accessToken: encryptToken(token.access_token),
        refreshToken,
        tokenExpiry: expiry,
        scope: token.scope ?? SCOPES,
        connectedById,
        connectedAt: new Date(),
      },
    });
  }

  async disconnect(): Promise<void> {
    await this.prisma.googleIntegration.deleteMany({ where: { provider: PROVIDER } });
  }

  /** 有効なアクセストークンを返す(期限切れならリフレッシュ)。未接続なら null。 */
  private async getAccessToken(): Promise<string | null> {
    const cfg = this.config();
    const row = await this.prisma.googleIntegration.findUnique({ where: { provider: PROVIDER } });
    if (!cfg || !row?.refreshToken) return null;

    if (row.accessToken && row.tokenExpiry && row.tokenExpiry.getTime() > Date.now()) {
      const token = decryptToken(row.accessToken);
      if (token) return token;
    }

    const refreshToken = decryptToken(row.refreshToken);
    if (!refreshToken) return null;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      this.logger.error(`token refresh failed: ${await res.text()}`);
      return null;
    }
    const token = (await res.json()) as { access_token: string; expires_in: number };
    await this.prisma.googleIntegration.update({
      where: { provider: PROVIDER },
      data: {
        accessToken: encryptToken(token.access_token),
        tokenExpiry: new Date(Date.now() + (token.expires_in - 60) * 1000),
      },
    });
    return token.access_token;
  }

  /**
   * Googleカレンダーに予定を作り、Google MeetのURLを発行して返す。
   * 題名は都度指定する(要望)。
   */
  async createMeet(params: { summary: string; startAt: Date; endAt: Date | null }): Promise<{ meetUrl: string; eventId: string }> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) throw new BadRequestException('Googleカレンダーが未連携です。連携設定から接続してください');

    const row = await this.prisma.googleIntegration.findUnique({ where: { provider: PROVIDER } });
    const calendarId = row?.calendarId || 'primary';
    const end = params.endAt ?? new Date(params.startAt.getTime() + 60 * 60000);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: params.summary,
          start: { dateTime: params.startAt.toISOString(), timeZone: 'Asia/Tokyo' },
          end: { dateTime: end.toISOString(), timeZone: 'Asia/Tokyo' },
          conferenceData: {
            createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
          },
        }),
      },
    );
    if (!res.ok) {
      this.logger.error(`create meet failed: ${await res.text()}`);
      throw new BadRequestException('Google Meetの作成に失敗しました');
    }
    const event = (await res.json()) as { id: string; hangoutLink?: string; conferenceData?: { entryPoints?: { uri: string }[] } };
    const meetUrl =
      event.hangoutLink ?? event.conferenceData?.entryPoints?.find((e) => e.uri?.startsWith('https://meet'))?.uri ?? '';
    if (!meetUrl) throw new BadRequestException('Google MeetのURLが取得できませんでした');
    return { meetUrl, eventId: event.id };
  }

  /** アポ詳細に対してMeetを作成し、meetingUrl・googleCalendarEventIdへ保存する。 */
  async createMeetForAppointment(appointmentId: string, title?: string): Promise<{ meetUrl: string }> {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, deletedAt: null },
      include: { customer: true },
    });
    if (!appt) throw new NotFoundException('アポ詳細が見つかりません');
    if (!appt.meetingStartAt) throw new BadRequestException('商談日時が未設定です');

    const summary = title?.trim() || appt.calendarTitle || appt.customer?.corporateName || 'オンライン商談';
    const { meetUrl, eventId } = await this.createMeet({
      summary,
      startAt: appt.meetingStartAt,
      endAt: appt.meetingEndAt,
    });

    const memo = appt.memo
      ? appt.memo.includes('GoogleMeetURL：')
        ? appt.memo.replace(/GoogleMeetURL：.*/g, `GoogleMeetURL：${meetUrl}`)
        : `${appt.memo}\nGoogleMeetURL：${meetUrl}`
      : `GoogleMeetURL：${meetUrl}`;

    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { meetingUrl: meetUrl, googleCalendarEventId: eventId, calendarSyncStatus: 'SYNCED', memo },
    });
    return { meetUrl };
  }

  /** トス→アポ自動作成時、HPZOOMなら自動でMeetを発行する。失敗しても致命的にしない。 */
  async tryAutoCreateMeet(appointmentId: string, title: string): Promise<string | null> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return null; // 未連携時は何もしない
      const { meetUrl } = await this.createMeetForAppointment(appointmentId, title);
      return meetUrl;
    } catch (err) {
      this.logger.warn(`auto meet creation skipped: ${(err as Error).message}`);
      return null;
    }
  }
}
