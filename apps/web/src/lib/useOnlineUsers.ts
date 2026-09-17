import { useEffect, useState } from 'react';
import { getSocket } from './useRealtimeSync';

export interface OnlineUser {
  userId: string;
  userName: string;
}

/**
 * 現在ログイン中(アプリを開いている)のアカウント一覧(要望)。company:defaultルームに
 * 全接続が自動joinしているため、そのままオンライン中のアカウント表示に使う。
 */
export function useOnlineUsers() {
  const [users, setUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const onSnapshot = (payload: OnlineUser[]) => setUsers(payload);
    socket.on('online.snapshot', onSnapshot);
    return () => {
      socket.off('online.snapshot', onSnapshot);
    };
  }, []);

  return users;
}
