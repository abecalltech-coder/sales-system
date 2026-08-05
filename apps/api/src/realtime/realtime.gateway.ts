import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/types';

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    }),
  );
}

/**
 * ルーム設計(セクション32): company/department/team/userへ自動join、
 * 案件詳細画面表示中のみtoss/appointment/visit/contractへ動的join。
 * 複数APIインスタンスへのスケールはRedis Adapter(Phase7拡張、REDIS_URL設定時に有効化)で対応する。
 */
@WebSocketGateway({
  cors: { origin: process.env.SOCKET_CORS_ORIGIN ?? 'http://localhost:5173', credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const cookies = parseCookies(client.handshake.headers.cookie);
      const token = cookies['access_token'];
      if (!token) throw new Error('no access_token cookie');

      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-insecure-secret',
      });

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status !== 'ACTIVE') throw new Error('inactive user');

      client.data.userId = user.id;
      await client.join(`user:${user.id}`);
      if (user.departmentId) await client.join(`department:${user.departmentId}`);
      if (user.teamId) await client.join(`team:${user.teamId}`);
      // 会社単位のルームは単一会社構成を前提にcompany:defaultとする(セクション5参照)
      await client.join('company:default');
    } catch (err) {
      this.logger.warn(`Socket auth failed: ${err instanceof Error ? err.message : String(err)}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`disconnected: ${client.id}`);
  }
}
