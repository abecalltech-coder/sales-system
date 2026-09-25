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
      pending.clear();
    };
    const handleCaseUpdated = (event: CaseUpdatedEvent) => {
      const key = ENTITY_QUERY_KEY[event.entityType];
      if (!key) return;
      pending.add(key);
      if (timer === undefined) timer = window.setTimeout(flush, 800);
    };

    s.on('case.updated', handleCaseUpdated);
    return () => {
      s.off('case.updated', handleCaseUpdated);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [queryClient]);
}
