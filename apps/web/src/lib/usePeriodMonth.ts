import { useCallback, useSyncExternalStore } from 'react';

/**
 * 全画面共通の「対象月(periodMonth = "YYYY-MM")」。
 * URL の ?month= と localStorage を同期し、どの画面で切り替えても他画面へ引き継がれる。
 * 日本にサマータイムは無いので JST は UTC+9 固定で計算してよい。
 */

const STORAGE_KEY = 'period.month';
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

function read(): string {
  if (typeof window === 'undefined') return currentPeriodMonth();
  const fromUrl = new URLSearchParams(window.location.search).get('month');
  if (isValidPeriodMonth(fromUrl)) return fromUrl;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isValidPeriodMonth(stored)) return stored;
  } catch {
    /* private mode 等 */
  }
  return currentPeriodMonth();
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('popstate', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('popstate', cb);
  };
}

export function usePeriodMonth(): [string, (next: string) => void] {
  const value = useSyncExternalStore(subscribe, read, currentPeriodMonth);

  const set = useCallback((next: string) => {
    if (!isValidPeriodMonth(next)) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
    const url = new URL(window.location.href);
    if (next === currentPeriodMonth()) url.searchParams.delete('month');
    else url.searchParams.set('month', next);
    window.history.replaceState(window.history.state, '', url.toString());
    emit();
  }, []);

  return [value, set];
}
