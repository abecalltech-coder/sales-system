import { useCallback, useSyncExternalStore } from 'react';

/**
 * 全画面共通の「対象月(periodMonth = "YYYY-MM")」。
 * 開いたとき(再読み込みを含む)は必ず当月(要望)。切り替えた月は開いている間だけ他画面へ引き継ぎ、保存しない。
 * 日本にサマータイムは無いので JST は UTC+9 固定で計算してよい。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentPeriodMonth(): string {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isValidPeriodMonth(v: string | null | undefined): v is string {
  return !!v && PERIOD_RE.test(v);
}

export function shiftPeriodMonth(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatPeriodMonth(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${y}年${m}月`;
}

/** 切り替えた月。当月なら null(開いたまま月が変わっても新しい当月に付いていく) */
let selected: string | null = null;

function read(): string {
  return selected ?? currentPeriodMonth();
}

// 以前ブラウザに記憶していた月を片付ける
try {
  window.localStorage.removeItem('period.month');
} catch {
  /* private mode 等 */
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function usePeriodMonth(): [string, (next: string) => void] {
  const value = useSyncExternalStore(subscribe, read, currentPeriodMonth);

  const set = useCallback((next: string) => {
    if (!isValidPeriodMonth(next)) return;
    selected = next === currentPeriodMonth() ? null : next;
    emit();
  }, []);

  return [value, set];
}
