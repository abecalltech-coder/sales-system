import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

let socket: Socket | null = null;

const ENTITY_QUERY_KEY: Record<string, string> = {
  TOSS_CASE: 'toss-cases',
  APPOINTMENT: 'appointments',
  VISIT: 'visits',
  CONTRACT: 'contracts',
  ENTRY: 'entries',
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
    if (!socket) {
      socket = io('/', { withCredentials: true, path: '/socket.io' });
    }

    const handleCaseUpdated = (event: CaseUpdatedEvent) => {
      const key = ENTITY_QUERY_KEY[event.entityType];
      if (key) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    };

    socket.on('case.updated', handleCaseUpdated);
    return () => {
      socket?.off('case.updated', handleCaseUpdated);
    };
  }, [queryClient]);
}
