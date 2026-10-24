import { useSyncExternalStore } from 'react';

/** 同じ画面を開いている他の人のマウスカーソル(要望)。usePresence が書き込み、RemoteCursors が描く */
export interface RemotePointer {
  socketId: string;
  userId: string;
  userName: string;
  rowId?: string;
  columnKey?: string;
  fx?: number;
  fy?: number;
  x?: number;
  y?: number;
  at: number;
}

let pointers = new Map<string, RemotePointer>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function setRemotePointer(p: Omit<RemotePointer, 'at'>) {
  pointers = new Map(pointers).set(p.socketId, { ...p, at: Date.now() });
  notify();
}
export function removeRemotePointer(socketId: string) {
  if (!pointers.has(socketId)) return;
  pointers = new Map(pointers);
  pointers.delete(socketId);
  notify();
}
export function clearRemotePointers() {
  if (pointers.size === 0) return;
  pointers = new Map();
  notify();
}

export function useRemotePointers(): Map<string, RemotePointer> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => pointers,
  );
}
