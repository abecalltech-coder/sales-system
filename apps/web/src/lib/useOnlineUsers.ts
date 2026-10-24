import { useEffect, useState } from 'react';
import { getSocket } from './useRealtimeSync';

export interface OnlineUser {
  userId: string;
  userName: string;
}

// 画面を移動するとサイドバーごと作り直されるため、最後に受け取った一覧を覚えておく
let lastOnline: OnlineUser[] = [];

/**
 * 現在ログイン中(アプリを開いている)のアカウント一覧(要望)。company:defaultルームに
 * 全接続が自動joinしているため、そのままオンライン中のアカウント表示に使う。
 * 以前は接続・切断の瞬間にしか届かず、画面を移動すると空のまま(時間が経つと古いまま)になっていたので、
 * 開いたときに最新を取り直す(サーバーも30秒ごとに配り直す)。
 */
export function useOnlineUsers() {
  const [users, setUsers] = useState<OnlineUser[]>(lastOnline);

  useEffect(() => {
    const socket = getSocket();
    const onSnapshot = (payload: OnlineUser[]) => {
      lastOnline = payload;
      setUsers(payload);
    };
    const request = () => socket.emit('online.request');
    socket.on('online.snapshot', onSnapshot);
    socket.on('connect', request);
    if (socket.connected) request();
    return () => {
      socket.off('online.snapshot', onSnapshot);
      socket.off('connect', request);
    };
  }, []);

  return users;
}
