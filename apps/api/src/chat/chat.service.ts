import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { CreateRoomDto, ForwardDto, NotifyMode, SendMessageDto, UpdateRoomDto } from './chat.dto';

export const MENTION_ALL = 'all';

const PAGE = 200;

export interface ForwardItem {
  senderName: string;
  body: string | null;
  image: string | null;
  createdAt: string;
}

/**
 * チャット(要望)。ルームは手動作成のみ(自動作成しない)。
 * 既読は各メンバーの lastReadAt とメッセージ日時の比較で判定する(誰が読んだかも出せる)。
 * 更新はメンバーへ Socket の chat.updated(ルームIDのみ)で知らせ、本文はAPIで取り直す(非メンバーへ内容を流さない)。
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly push: PushNotificationsService,
  ) {}

  private async assertMember(roomId: string, userId: string) {
    const m = await this.prisma.chatMember.findUnique({ where: { roomId_userId: { roomId, userId } }, include: { room: true } });
    if (!m || m.room.deletedAt) throw new ForbiddenException('このトークのメンバーではありません');
    return m;
  }

  private async notifyMembers(roomId: string, extra: Record<string, unknown> = {}) {
    const members = await this.prisma.chatMember.findMany({ where: { roomId }, select: { userId: true } });
    for (const m of members) this.realtime.emitToUser(m.userId, 'chat.updated', { roomId, ...extra });
  }

  // ---------------------------------------------------------------- ルーム

  async listRooms(userId: string) {
    const memberships = await this.prisma.chatMember.findMany({
      where: { userId, room: { deletedAt: null } },
      include: {
        room: {
          include: {
            _count: { select: { members: true } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { name: true } } } },
          },
        },
      },
    });
    const unread = await Promise.all(
      memberships.map((m) =>
        this.prisma.chatMessage.count({ where: { roomId: m.roomId, createdAt: { gt: m.lastReadAt }, senderId: { not: userId }, unsentAt: null } }),
      ),
    );
    // 未読の中に自分宛て(または全員宛て)のメンションがあるか
    const unreadMentions = await Promise.all(
      memberships.map((m) =>
        this.prisma.chatMessage.count({
          where: {
            roomId: m.roomId,
            createdAt: { gt: m.lastReadAt },
            senderId: { not: userId },
            unsentAt: null,
            mentions: { hasSome: [userId, MENTION_ALL] },
          },
        }),
      ),
    );
    return memberships
      .map((m, i) => {
        const last = m.room.messages[0];
        return {
          id: m.room.id,
          name: m.room.name,
          photo: m.room.photo,
          memberCount: m.room._count.members,
          lastMessageAt: m.room.lastMessageAt,
          lastMessage: last ? { senderName: last.sender.name, text: this.previewText(last), createdAt: last.createdAt } : null,
          unread: unread[i],
          unreadMentions: unreadMentions[i],
        };
      })
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }

  private previewText(m: { body: string | null; image: string | null; unsentAt: Date | null; forwardBundle: Prisma.JsonValue }) {
    if (m.unsentAt) return 'メッセージの送信を取り消しました';
    if (m.forwardBundle) return 'トークを転送しました';
    if (m.body) return m.body.slice(0, 80);
    if (m.image) return '写真';
    return '';
  }

  async unreadTotal(userId: string) {
    const memberships = await this.prisma.chatMember.findMany({ where: { userId, room: { deletedAt: null } } });
    const counts = await Promise.all(
      memberships.map((m) =>
        this.prisma.chatMessage.count({ where: { roomId: m.roomId, createdAt: { gt: m.lastReadAt }, senderId: { not: userId }, unsentAt: null } }),
      ),
    );
    return { total: counts.reduce((a, b) => a + b, 0) };
  }

  async getRoom(roomId: string, userId: string) {
    await this.assertMember(roomId, userId);
    const room = await this.prisma.chatRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: { members: { include: { user: { select: { id: true, name: true, iconUrl: true } } }, orderBy: { joinedAt: 'asc' } } },
    });
    return {
      id: room.id,
      name: room.name,
      photo: room.photo,
      members: room.members.map((m) => ({ id: m.user.id, name: m.user.name, iconUrl: m.user.iconUrl, lastReadAt: m.lastReadAt })),
    };
  }

  async createRoom(dto: CreateRoomDto, userId: string) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('グループ名を入力してください');
    const memberIds = [...new Set([userId, ...dto.memberIds])];
    const room = await this.prisma.chatRoom.create({
      data: {
        name,
        photo: dto.photo || null,
        createdBy: userId,
        members: { create: memberIds.map((id) => ({ userId: id })) },
      },
    });
    await this.notifyMembers(room.id);
    return { id: room.id };
  }

  async updateRoom(roomId: string, dto: UpdateRoomDto, userId: string) {
    await this.assertMember(roomId, userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.chatRoom.update({
        where: { id: roomId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() || undefined } : {}),
          ...(dto.photo !== undefined ? { photo: dto.photo || null } : {}),
        },
      });
      if (dto.memberIds) {
        // 自分を外すときは「退出」を使う。編集で自分が消えないようにする
        const next = new Set([...dto.memberIds, userId]);
        const current = await tx.chatMember.findMany({ where: { roomId } });
        const removed = current.filter((m) => !next.has(m.userId)).map((m) => m.userId);
        const added = [...next].filter((id) => !current.some((m) => m.userId === id));
        if (removed.length) await tx.chatMember.deleteMany({ where: { roomId, userId: { in: removed } } });
        if (added.length) await tx.chatMember.createMany({ data: added.map((id) => ({ roomId, userId: id })) });
        for (const id of removed) this.realtime.emitToUser(id, 'chat.updated', { roomId });
      }
    });
    await this.notifyMembers(roomId);
    return { ok: true };
  }

  async leaveRoom(roomId: string, userId: string) {
    await this.assertMember(roomId, userId);
    await this.prisma.chatMember.delete({ where: { roomId_userId: { roomId, userId } } });
    const left = await this.prisma.chatMember.count({ where: { roomId } });
    if (left === 0) await this.prisma.chatRoom.update({ where: { id: roomId }, data: { deletedAt: new Date() } });
    this.realtime.emitToUser(userId, 'chat.updated', { roomId });
    await this.notifyMembers(roomId);
    return { ok: true };
  }

  // ---------------------------------------------------------------- メッセージ

  async listMessages(roomId: string, userId: string, before?: string) {
    await this.assertMember(roomId, userId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { roomId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAGE,
      include: { sender: { select: { id: true, name: true, iconUrl: true } } },
    });
    const replyIds = [...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x))];
    const replies = replyIds.length
      ? await this.prisma.chatMessage.findMany({ where: { id: { in: replyIds } }, include: { sender: { select: { name: true } } } })
      : [];
    const members = await this.prisma.chatMember.findMany({ where: { roomId } });
    return {
      hasMore: rows.length === PAGE,
      messages: rows.reverse().map((m) => {
        const reply = m.replyToId ? replies.find((r) => r.id === m.replyToId) : undefined;
        return {
          id: m.id,
          senderId: m.senderId,
          senderName: m.sender.name,
          senderIcon: m.sender.iconUrl,
          body: m.unsentAt ? null : m.body,
          image: m.unsentAt ? null : m.image,
          forwardedFrom: m.unsentAt ? null : m.forwardedFrom,
          forwardBundle: m.unsentAt ? null : (m.forwardBundle as ForwardItem[] | null),
          unsent: !!m.unsentAt,
          mentions: m.unsentAt ? [] : m.mentions,
          createdAt: m.createdAt,
          replyTo: reply
            ? { id: reply.id, senderName: reply.sender.name, text: this.previewText(reply) }
            : null,
          // 送信者以外で、このメッセージ以降まで読んだメンバー数
          readCount: members.filter((x) => x.userId !== m.senderId && x.lastReadAt >= m.createdAt).length,
        };
      }),
    };
  }

  /** 既読にしたメンバー一覧(要望: 既読数を押すと誰が見たか分かる) */
  async readers(messageId: string, userId: string) {
    const msg = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('メッセージが見つかりません');
    await this.assertMember(msg.roomId, userId);
    const members = await this.prisma.chatMember.findMany({
      where: { roomId: msg.roomId, userId: { not: msg.senderId } },
      include: { user: { select: { id: true, name: true, iconUrl: true } } },
    });
    const read = members.filter((m) => m.lastReadAt >= msg.createdAt);
    const unread = members.filter((m) => m.lastReadAt < msg.createdAt);
    const toUser = (m: (typeof members)[number]) => ({ id: m.user.id, name: m.user.name, iconUrl: m.user.iconUrl });
    return { read: read.map(toUser), unread: unread.map(toUser) };
  }

  async send(roomId: string, dto: SendMessageDto, userId: string) {
    await this.assertMember(roomId, userId);
    const body = dto.body?.trim() ? dto.body : null;
    if (!body && !dto.image) throw new BadRequestException('メッセージを入力してください');
    if (dto.replyToId) {
      const r = await this.prisma.chatMessage.findUnique({ where: { id: dto.replyToId } });
      if (!r || r.roomId !== roomId) throw new BadRequestException('リプライ先が見つかりません');
    }
    // メンションはこのトークのメンバー(または全員)に限る
    let mentions: string[] = [];
    if (dto.mentions?.length) {
      const memberIds = new Set((await this.prisma.chatMember.findMany({ where: { roomId }, select: { userId: true } })).map((m) => m.userId));
      mentions = [...new Set(dto.mentions)].filter((id) => id === MENTION_ALL || (memberIds.has(id) && id !== userId));
    }
    const msg = await this.createMessage(roomId, userId, { body, image: dto.image || null, replyToId: dto.replyToId || null, mentions });
    return { id: msg.id };
  }

  private async createMessage(roomId: string, userId: string, data: Omit<Prisma.ChatMessageUncheckedCreateInput, 'roomId' | 'senderId'>) {
    const now = new Date();
    const msg = await this.prisma.chatMessage.create({ data: { ...data, roomId, senderId: userId, createdAt: now } });
    await this.prisma.chatRoom.update({ where: { id: roomId }, data: { lastMessageAt: now } });
    // 自分の発言までは既読
    await this.prisma.chatMember.update({ where: { roomId_userId: { roomId, userId } }, data: { lastReadAt: now } });
    await this.notifyMembers(roomId);
    void this.pushToMembers(roomId, userId, msg);
    return msg;
  }

  private async pushToMembers(
    roomId: string,
    senderId: string,
    msg: { body: string | null; image: string | null; forwardBundle: Prisma.JsonValue | null; unsentAt: Date | null; mentions?: string[] },
  ) {
    try {
      const [room, sender, members, settings] = await Promise.all([
        this.prisma.chatRoom.findUnique({ where: { id: roomId } }),
        this.prisma.user.findUnique({ where: { id: senderId }, select: { name: true } }),
        this.prisma.chatMember.findMany({ where: { roomId, userId: { not: senderId } }, select: { userId: true } }),
        this.prisma.chatNotifySetting.findMany({ where: { roomId } }),
      ]);
      if (!room || members.length === 0) return;
      const modeOf = new Map(settings.map((s) => [s.endpoint, s.mode as NotifyMode]));
      const mentions = msg.mentions ?? [];
      const text = this.previewText({ ...msg, forwardBundle: msg.forwardBundle ?? null });
      await this.push.sendToUsersPerSubscription(
        members.map((m) => m.userId),
        (sub) => {
          const mentioned = mentions.includes(sub.userId) || mentions.includes(MENTION_ALL);
          const mode = modeOf.get(sub.endpoint) ?? 'ALL';
          if (mode === 'OFF' || (mode === 'MENTION' && !mentioned)) return null;
          return {
            // メンションされた通知はそれと分かるようにする(要望)
            title: mentioned ? `【メンション】${room.name}` : room.name,
            body: mentioned
              ? `${sender?.name ?? ''}さんが${mentions.includes(sub.userId) ? 'あなた' : '全員'}をメンションしました: ${text}`
              : `${sender?.name ?? ''}: ${text}`,
            url: `/chat/${roomId}`,
            tag: mentioned ? `chat-mention:${roomId}` : `chat:${roomId}`,
          };
        },
      );
    } catch {
      // 通知の失敗でメッセージ送信を失敗扱いにしない
    }
  }

  /** この端末(購読)のこのグループの通知設定 */
  async getNotify(roomId: string, userId: string, endpoint: string) {
    await this.assertMember(roomId, userId);
    const s = await this.prisma.chatNotifySetting.findUnique({ where: { endpoint_roomId: { endpoint, roomId } } });
    return { mode: (s?.mode as NotifyMode | undefined) ?? 'ALL' };
  }

  async setNotify(roomId: string, userId: string, endpoint: string, mode: NotifyMode) {
    await this.assertMember(roomId, userId);
    // 他人の端末の設定は変えられないよう、購読が本人のものか確認する
    const sub = await this.prisma.pushSubscription.findUnique({ where: { endpoint } });
    if (!sub || sub.userId !== userId) throw new ForbiddenException('この端末の通知が有効になっていません');
    await this.prisma.chatNotifySetting.upsert({
      where: { endpoint_roomId: { endpoint, roomId } },
      update: { mode },
      create: { endpoint, roomId, mode },
    });
    return { mode };
  }

  async markRead(roomId: string, userId: string) {
    await this.assertMember(roomId, userId);
    await this.prisma.chatMember.update({ where: { roomId_userId: { roomId, userId } }, data: { lastReadAt: new Date() } });
    await this.notifyMembers(roomId, { read: true });
    return { ok: true };
  }

  /** 送信取り消し(自分のメッセージのみ)。「取り消しました」と表示を残す */
  async unsend(messageId: string, userId: string) {
    const msg = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('メッセージが見つかりません');
    if (msg.senderId !== userId) throw new ForbiddenException('自分のメッセージだけ取り消せます');
    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { unsentAt: new Date(), body: null, image: null, forwardBundle: Prisma.DbNull, forwardedFrom: null },
    });
    await this.notifyMembers(msg.roomId);
    return { ok: true };
  }

  /**
   * 転送(要望)。1件ならそのまま転送、複数ならやり取りを1つにまとめて転送する。
   * 転送元・転送先どちらのメンバーでもある必要がある。
   */
  async forward(dto: ForwardDto, userId: string) {
    const msgs = await this.prisma.chatMessage.findMany({
      where: { id: { in: dto.messageIds }, unsentAt: null },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { name: true } } },
    });
    if (msgs.length === 0) throw new BadRequestException('転送するメッセージがありません');
    for (const roomId of new Set(msgs.map((m) => m.roomId))) await this.assertMember(roomId, userId);
    for (const target of dto.targetRoomIds) await this.assertMember(target, userId);

    for (const target of dto.targetRoomIds) {
      if (msgs.length === 1) {
        const m = msgs[0];
        await this.createMessage(target, userId, {
          body: m.body,
          image: m.image,
          forwardedFrom: m.sender.name,
          forwardBundle: m.forwardBundle ?? undefined,
        });
      } else {
        const bundle: ForwardItem[] = msgs.flatMap((m) =>
          // まとめた転送をさらにまとめる場合は中身を展開して1つにする
          Array.isArray(m.forwardBundle)
            ? (m.forwardBundle as unknown as ForwardItem[])
            : [{ senderName: m.sender.name, body: m.body, image: m.image, createdAt: m.createdAt.toISOString() }],
        );
        await this.createMessage(target, userId, { forwardBundle: bundle as unknown as Prisma.InputJsonValue });
      }
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------- アカウント写真

  async profile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, iconUrl: true } });
  }

  async updateProfile(userId: string, iconUrl: string | null) {
    await this.prisma.user.update({ where: { id: userId }, data: { iconUrl: iconUrl || null } });
    this.realtime.emitToAll('users.updated', {});
    return this.profile(userId);
  }
}
