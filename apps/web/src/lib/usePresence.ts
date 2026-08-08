import { useEffect, useRef, useState } from 'react';
import { getSocket } from './useRealtimeSync';

export interface PresenceViewer {
  socketId: string;
  userId: string;
  userName: string;
}

interface CursorInfo {
  socketId: string;
  userId: string;
  userName: string;
  rowId: string;
  columnKey: string;
}

interface CursorSnapshot {
  entityType: string;
  cursors: CursorInfo[];
}

const CURSOR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#d946ef', '#14b8a6'];

/** userIdから決定的に色を割り当てる(同じユーザーは常に同じ色になる) */
export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

/**
 * 一覧画面の閲覧者・セル単位のカーソル位置をSocket.IOで共有する(セクション追加要望)。
 * Redis等の追加インフラは使わず、既存のSocket.IO接続に相乗りする。
 */
export function usePresence(entityType: string, currentUserId: string | undefined) {
  const [viewers, setViewers] = useState<PresenceViewer[]>([]);
  const cursorsRef = useRef<Map<string, CursorInfo>>(new Map());
  const [cursorVersion, setCursorVersion] = useState(0);

  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const join = () => socket.emit('presence.join', { room: entityType });

    // React 18 StrictMode(開発時)はeffectを「マウント→即クリーンアップ→再マウント」と
    // 二重実行するため、離脱(leave)を即座に送ると再マウント後にjoinし直すまでの間
    // 在室情報やカーソル位置が一瞬失われる。離脱を少し遅延させ、直後の再マウントで
    // 取り消せるようにする(本当のアンマウント時は300ms後に確定して離脱する)。
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    } else {
      if (socket.connected) join();
    }

    // タブのバックグラウンド化等でSocket.IOが裏で切断→再接続すると、接続自体は復旧しても
    // presence.joinを送り直さない限りルームへの再参加が行われず、以後のイベントを
    // 受信できないまま固まって見える不具合があった。'connect'は再接続時にも発火するため、
    // ここで毎回joinし直すことで復旧させる。
    socket.on('connect', join);

    const onPresence = (payload: { entityType: string; viewers: PresenceViewer[] }) => {
      if (payload.entityType !== entityType) return;
      setViewers(payload.viewers);
    };
    const onCursorUpdated = (payload: CursorInfo) => {
      cursorsRef.current.set(payload.socketId, payload);
      setCursorVersion((v) => v + 1);
    };
    const onCursorCleared = (payload: { socketId: string }) => {
      if (cursorsRef.current.delete(payload.socketId)) {
        setCursorVersion((v) => v + 1);
      }
    };
    // join直後にサーバーから送られる現在のカーソル状況で置き換える(再接続直後、
    // 他ユーザーがまだ何も動かしていなくても最新状態をすぐ復元できるようにする)。
    const onCursorSnapshot = (payload: CursorSnapshot) => {
      if (payload.entityType !== entityType) return;
      cursorsRef.current = new Map(payload.cursors.map((c) => [c.socketId, c]));
      setCursorVersion((v) => v + 1);
    };

    socket.on('presence.updated', onPresence);
    socket.on('cursor.updated', onCursorUpdated);
    socket.on('cursor.cleared', onCursorCleared);
    socket.on('cursor.snapshot', onCursorSnapshot);

    return () => {
      socket.off('connect', join);
      socket.off('presence.updated', onPresence);
      socket.off('cursor.updated', onCursorUpdated);
      socket.off('cursor.cleared', onCursorCleared);
      socket.off('cursor.snapshot', onCursorSnapshot);
      leaveTimerRef.current = setTimeout(() => {
        socket.emit('presence.leave', { room: entityType });
        cursorsRef.current.clear();
        leaveTimerRef.current = null;
      }, 300);
    };
  }, [entityType]);

  const notifyFocus = (rowId: string, columnKey: string) => {
    getSocket().emit('cursor.move', { room: entityType, rowId, columnKey });
  };
  const notifyBlur = () => {
    getSocket().emit('cursor.clear', { room: entityType });
  };

  const cellCursor = (rowId: string, columnKey: string) => {
    void cursorVersion; // cursorsRef更新時の再レンダー用
    for (const c of cursorsRef.current.values()) {
      if (c.rowId === rowId && c.columnKey === columnKey && c.userId !== currentUserId) {
        return { userName: c.userName, color: colorForUser(c.userId) };
      }
    }
    return undefined;
  };

  return {
    viewers: viewers.filter((v) => v.userId !== currentUserId),
    notifyFocus,
    notifyBlur,
    cellCursor,
  };
}
