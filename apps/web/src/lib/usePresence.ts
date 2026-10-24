import { useEffect, useRef, useState } from 'react';
import { getSocket } from './useRealtimeSync';
import { colorFor } from '../components/Avatar';
import { clearRemotePointers, removeRemotePointer, setRemotePointer, RemotePointer } from './remotePointers';

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

/** userIdからアカウントの色を返す(要望: アカウントのアイコンと同じ色で選択中のセルを表示する) */
export function colorForUser(userId: string): string {
  return colorFor(userId);
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
  // 他の人が同じ画面を開いているときだけマウスカーソルを送る(一人のときは通信しない)
  const othersRef = useRef(false);
  othersRef.current = viewers.some((v) => v.userId !== currentUserId);

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

    // 画面に戻ったときも参加し直す(切れていた間の閲覧者・カーソルを取り直す)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && socket.connected) join();
    };
    document.addEventListener('visibilitychange', onVisible);

    // マウスカーソルの共有(要望)。一覧のセル上ならセル(行ID・列)と中の位置、それ以外は画面本体に対する位置で送る
    const onPointerUpdated = (p: Omit<RemotePointer, 'at'> & { room: string }) => {
      if (p.room !== entityType) return;
      setRemotePointer(p);
    };
    const onPointerCleared = (p: { socketId: string }) => removeRemotePointer(p.socketId);
    socket.on('pointer.updated', onPointerUpdated);
    socket.on('pointer.cleared', onPointerCleared);
    let lastSent = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let lastEvent: PointerEvent | null = null;
    const send = () => {
      pending = null;
      lastSent = Date.now();
      const e = lastEvent;
      if (!e || !socket.connected) return;
      const cell = (e.target as Element | null)?.closest?.('td[data-row-id][data-col-key]') as HTMLElement | null;
      if (cell) {
        const r = cell.getBoundingClientRect();
        socket.emit('pointer.move', {
          room: entityType,
          rowId: cell.dataset.rowId,
          columnKey: cell.dataset.colKey,
          fx: (e.clientX - r.left) / Math.max(1, r.width),
          fy: (e.clientY - r.top) / Math.max(1, r.height),
        });
        return;
      }
      const main = document.querySelector('main');
      if (!main) return;
      const r = main.getBoundingClientRect();
      socket.emit('pointer.move', { room: entityType, x: (e.clientX - r.left) / Math.max(1, r.width), y: e.clientY - r.top });
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !othersRef.current) return; // 携帯の指・一人のときは送らない
      lastEvent = e;
      if (pending) return;
      pending = setTimeout(send, Math.max(0, 70 - (Date.now() - lastSent)));
    };
    const onPointerLeave = () => {
      lastEvent = null;
      if (socket.connected) socket.emit('pointer.clear', { room: entityType });
    };
    document.addEventListener('pointermove', onPointerMove);
    document.documentElement.addEventListener('mouseleave', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);

    socket.on('presence.updated', onPresence);
    socket.on('cursor.updated', onCursorUpdated);
    socket.on('cursor.cleared', onCursorCleared);
    socket.on('cursor.snapshot', onCursorSnapshot);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('mouseleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      if (pending) clearTimeout(pending);
      socket.off('pointer.updated', onPointerUpdated);
      socket.off('pointer.cleared', onPointerCleared);
      clearRemotePointers();
      if (socket.connected) socket.emit('pointer.clear', { room: entityType });
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
