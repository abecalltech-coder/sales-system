import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
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

// プレゼンス/カーソル共有を許可する一覧種別(それ以外のroom名は無視する)。
// 要望: トス/アポ/エントリーの3画面限定だったものをサマリー・営業タブ全て・シフトにも拡大。
const PRESENCE_ROOMS = [
  'TOSS_CASE',
  'APPOINTMENT',
  'VISIT',
  'CONTRACT',
  'DEAL',
  'SHIFT',
  'SUMMARY',
  'FREE_SHEET',
  'FINAL_REPORT',
  'CL_CALENDAR',
  'TOSS_NEW',
];

interface CursorPayload {
  socketId: string;
  userId: string;
  userName: string;
  rowId: string;
  columnKey: string;
}

/**
 * ルーム設計(セクション32): company/department/team/userへ自動join、
 * 案件詳細画面表示中のみtoss/appointment/visit/contractへ動的join。
 * 複数APIインスタンスへのスケールはRedis Adapter(Phase7拡張、REDIS_URL設定時に有効化)で対応する。
 *
 * プレゼンス/カーソル共有(セクション追加要望)は単一インスタンス前提でSocket.IOのルーム機能のみで
 * 実現し、Redis等の追加インフラを必要としない(メモリ上で完結)。
 */
@WebSocketGateway({
  cors: { origin: process.env.SOCKET_CORS_ORIGIN ?? 'http://localhost:5173', credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  // entityType(room) -> socketId -> 直近のカーソル位置。タブのバックグラウンド化等で
  // Socket.IOが裏で再接続した際、再joinしたクライアントへ現在の状態を即座に復元するために使う
  // (再接続前に他ユーザーが動かしていなければcursor.updatedイベントが来ないため)。
  private cursorState = new Map<string, Map<string, CursorPayload>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 「ログイン中」「このタブを開いている人」は接続・切断の瞬間にしか配信していなかったため、
   * 配信を取りこぼした画面は時間が経つと古いままになっていた(要望)。30秒ごとに最新を配り直す。
   */
  afterInit() {
    setInterval(() => {
      if (!this.server) return;
      this.broadcastOnlineUsers();
      for (const room of PRESENCE_ROOMS) {
        if (this.server.sockets.adapter.rooms.get(`presence:${room}`)?.size) this.broadcastPresence(room);
      }
    }, 30_000).unref();
  }

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
      client.data.userName = user.name;
      await client.join(`user:${user.id}`);
      if (user.departmentId) await client.join(`department:${user.departmentId}`);
      if (user.teamId) await client.join(`team:${user.teamId}`);
      // 会社単位のルームは単一会社構成を前提にcompany:defaultとする(セクション5参照)
      await client.join('company:default');

      // 全員が繋いだ時点でcompany:defaultへ入るため、ここを「ログイン中/操作中のアカウント」
      // 表示(要望)にそのまま使う。接続してきたクライアント自身にも現在のオンライン一覧を返す。
      const online = this.onlineUsersSnapshot();
      client.emit('online.snapshot', online);
      this.broadcastOnlineUsers();
      // 認証(非同期)が終わる前に presence.join が届いていた場合、名前の無い閲覧者になっていたので配り直す
      for (const room of PRESENCE_ROOMS) {
        if (client.rooms.has(`presence:${room}`)) this.broadcastPresence(room);
      }
    } catch (err) {
      this.logger.warn(`Socket auth failed: ${err instanceof Error ? err.message : String(err)}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    // disconnect時点ではSocket.IOが既に全roomから離脱させているため、client.roomsでの判定は当てにせず
    // 全プレゼンスroomへ無条件でカーソル解除を配信する(.to()は宛先room側の在室者にのみ届くため副作用はない)。
    for (const room of PRESENCE_ROOMS) {
      this.cursorState.get(room)?.delete(client.id);
      client.to(`presence:${room}`).emit('cursor.cleared', { socketId: client.id });
      client.to(`presence:${room}`).emit('pointer.cleared', { socketId: client.id });
      this.broadcastPresence(room);
    }
    // このクライアントがcompany:defaultから抜けた後の状態を配信する(自分の分は除外して届く)
    this.broadcastOnlineUsers();
    this.logger.debug(`disconnected: ${client.id}`);
  }

  /**
   * 一覧画面を開いた時、およびタブのバックグラウンド化等でSocket.IOが裏で再接続した時に呼ぶ。
   * 誰が閲覧中かを共有するルームへjoinし、joinしたクライアントへ現在のカーソル状況を
   * スナップショットとして返す(再接続後、他ユーザーが動かすまで何も見えない問題を防ぐ)。
   */
  @SubscribeMessage('presence.join')
  handlePresenceJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { room?: string }) {
    if (!data?.room || !PRESENCE_ROOMS.includes(data.room)) return;
    client.join(`presence:${data.room}`);
    this.broadcastPresence(data.room);
    const cursors = [...(this.cursorState.get(data.room)?.values() ?? [])];
    client.emit('cursor.snapshot', { entityType: data.room, cursors });
  }

  /** 一覧画面を離れた時に呼ぶ。 */
  @SubscribeMessage('presence.leave')
  handlePresenceLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { room?: string }) {
    if (!data?.room || !PRESENCE_ROOMS.includes(data.room)) return;
    client.leave(`presence:${data.room}`);
    this.cursorState.get(data.room)?.delete(client.id);
    client.to(`presence:${data.room}`).emit('cursor.cleared', { socketId: client.id });
    client.to(`presence:${data.room}`).emit('pointer.cleared', { socketId: client.id });
    this.broadcastPresence(data.room);
  }

  /** 画面を開いた時・画面に戻った時に、今のログイン中一覧を受け取る(返り値は接続確認の応答にも使う) */
  @SubscribeMessage('online.request')
  handleOnlineRequest(@ConnectedSocket() client: Socket) {
    const online = this.onlineUsersSnapshot();
    client.emit('online.snapshot', online);
    return { ok: true };
  }

  /**
   * マウスカーソルの位置(要望: 同じ画面を開いている人のカーソルを表示)。サーバーには保存せず中継だけする。
   * 位置は一覧のセル(行ID・列キー・セル内の割合)か、画面本体に対する位置で送られてくる。
   */
  @SubscribeMessage('pointer.move')
  handlePointerMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { room?: string; rowId?: string; columnKey?: string; fx?: number; fy?: number; x?: number; y?: number },
  ) {
    if (!data?.room || !PRESENCE_ROOMS.includes(data.room) || !client.data.userId) return;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const str = (v: unknown) => (typeof v === 'string' && v.length <= 200 ? v : undefined);
    client.to(`presence:${data.room}`).emit('pointer.updated', {
      room: data.room,
      socketId: client.id,
      userId: client.data.userId,
      userName: client.data.userName,
      rowId: str(data.rowId),
      columnKey: str(data.columnKey),
      fx: num(data.fx),
      fy: num(data.fy),
      x: num(data.x),
      y: num(data.y),
    });
  }

  @SubscribeMessage('pointer.clear')
  handlePointerClear(@ConnectedSocket() client: Socket, @MessageBody() data: { room?: string }) {
    if (!data?.room || !PRESENCE_ROOMS.includes(data.room)) return;
    client.to(`presence:${data.room}`).emit('pointer.cleared', { socketId: client.id });
  }

  /** セルにフォーカスした時に呼ぶ。同じ一覧を見ている他ユーザーへカーソル位置を配信する。 */
  @SubscribeMessage('cursor.move')
  handleCursorMove(@ConnectedSocket() client: Socket, @MessageBody() data: { room?: string; rowId?: string; columnKey?: string }) {
    if (!data?.room || !PRESENCE_ROOMS.includes(data.room) || !data.rowId || !data.columnKey) return;
    const payload: CursorPayload = {
      socketId: client.id,
      userId: client.data.userId,
      userName: client.data.userName,
      rowId: data.rowId,
      columnKey: data.columnKey,
    };
    if (!this.cursorState.has(data.room)) this.cursorState.set(data.room, new Map());
    this.cursorState.get(data.room)!.set(client.id, payload);
    client.to(`presence:${data.room}`).emit('cursor.updated', payload);
  }

  /** セルからフォーカスが外れた時に呼ぶ。 */
  @SubscribeMessage('cursor.clear')
  handleCursorClear(@ConnectedSocket() client: Socket, @MessageBody() data: { room?: string }) {
    if (!data?.room || !PRESENCE_ROOMS.includes(data.room)) return;
    this.cursorState.get(data.room)?.delete(client.id);
    client.to(`presence:${data.room}`).emit('cursor.cleared', { socketId: client.id });
  }

  /**
   * 現在ログイン中(=Socket.IO接続中)のユーザー一覧(要望: ログイン中/操作中のアカウント表示)。
   * 同じ人が複数タブ/端末で開いていてもuserIdで1人にまとめる。
   */
  private onlineUsersSnapshot(): { userId: string; userName: string }[] {
    const socketIds = this.server.sockets.adapter.rooms.get('company:default') ?? new Set<string>();
    const byUserId = new Map<string, string>();
    for (const id of socketIds) {
      const s = this.server.sockets.sockets.get(id);
      if (s?.data.userId) byUserId.set(s.data.userId as string, s.data.userName as string);
    }
    return [...byUserId.entries()].map(([userId, userName]) => ({ userId, userName }));
  }

  private broadcastOnlineUsers() {
    this.server.to('company:default').emit('online.snapshot', this.onlineUsersSnapshot());
  }

  private broadcastPresence(entityType: string) {
    const room = `presence:${entityType}`;
    const socketIds = this.server.sockets.adapter.rooms.get(room) ?? new Set<string>();
    const viewers = [...socketIds]
      .map((id) => {
        const s = this.server.sockets.sockets.get(id);
        // 認証が終わっていない接続はまだ出さない(終わった時点で配り直す)
        return s?.data.userId ? { socketId: id, userId: s.data.userId as string, userName: s.data.userName as string } : null;
      })
      .filter((v): v is { socketId: string; userId: string; userName: string } => v !== null);
    this.server.to(room).emit('presence.updated', { entityType, viewers });
  }
}
