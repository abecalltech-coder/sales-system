import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

let socket: Socket | null = null;

/** アプリ全体で単一のSocket.IO接続を共有する(プレゼンス/カーソル共有など複数フックから利用) */
export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', { withCredentials: true, path: '/socket.io' });
  }
  return socket;
}

const ENTITY_QUERY_KEY: Record<string, string> = {
  TOSS_CASE: 'toss-cases',
  APPOINTMENT: 'appointments',
  VISIT: 'visits',
  CONTRACT: 'contracts',
  CUSTOMER: 'customers',
};

interface CaseUpdatedEvent {
  entityType: keyof typeof ENTITY_QUERY_KEY;
  id: string;
}

/**
 * Socket.IOへ接続し、他ユーザーの更新をリアルタイムに画面へ反映する(セクション32)。
 * 接続にはHttpOnly Cookie(access_token)を使うため、追加の認証情報は不要。
 * 切断時もREST操作は継続でき、再接続時に自動で再購読される。
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const s = getSocket();

    // 一覧は全件を取得するため、更新イベントごとに即再取得すると連続編集・一括投入時に重くなる。
    // 短時間のイベントはまとめて、種類ごとに1回だけ再取得する(要望: 全件表示でも重くならないように)
    const pending = new Set<string>();
    let timer: number | undefined;
    const flush = () => {
      timer = undefined;
      for (const key of pending) queryClient.invalidateQueries({ queryKey: [key] });
      // トス・アポが変わればサマリーの集計も変わる
      if (pending.size) queryClient.invalidateQueries({ queryKey: ['department-summary'] });
      pending.clear();
    };
    const handleCaseUpdated = (event: CaseUpdatedEvent) => {
      const key = ENTITY_QUERY_KEY[event.entityType];
      if (!key) return;
      pending.add(key);
      if (timer === undefined) timer = window.setTimeout(flush, 800);
    };

    s.on('case.updated', handleCaseUpdated);
    // チャット: 中身は送られてこないので、該当ルームの一覧・発言・未読数を取り直す
    const handleChat = (e: { roomId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] });
      queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
      if (e?.roomId) {
        queryClient.invalidateQueries({ queryKey: ['chat', 'messages', e.roomId] });
        queryClient.invalidateQueries({ queryKey: ['chat', 'room', e.roomId] });
      }
    };
    // アカウント写真の変更
    const handleUsers = () => {
      queryClient.invalidateQueries({ queryKey: ['user-options'] });
      queryClient.invalidateQueries({ queryKey: ['chat'] });
    };
    // 申込情報/明細(全員で共有)
    const handleSheets = (e: { id?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['application-sheets'] });
      if (e?.id) queryClient.invalidateQueries({ queryKey: ['application-sheet-photos', e.id] });
    };
    s.on('application-sheets.updated', handleSheets);
    const handleSummary = () => queryClient.invalidateQueries({ queryKey: ['department-summary'] });
    s.on('department-summary.updated', handleSummary);
    s.on('chat.updated', handleChat);
    s.on('users.updated', handleUsers);
    return () => {
      s.off('case.updated', handleCaseUpdated);
      s.off('chat.updated', handleChat);
      s.off('application-sheets.updated', handleSheets);
      s.off('department-summary.updated', handleSummary);
      s.off('users.updated', handleUsers);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [queryClient]);
}
