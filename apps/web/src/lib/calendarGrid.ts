/** CLカレンダーの月/週/日グリッド計算用の純粋関数群 */

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** 日曜始まりの週の先頭日を返す */
function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

/** 月表示用に、月初を含む週の日曜から月末を含む週の土曜までの日付配列を返す(6週間になるよう42日に揃える) */
export function monthGridDays(anchor: Date): Date[] {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/** 週表示用に、指定日を含む週(日曜始まり)の7日間を返す */
export function weekGridDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

/** 表示範囲(dateFrom/dateTo、ISO)を計算する。月表示はグリッド全体(前後月の見えている日含む)をカバーする */
export function visibleRange(viewMode: 'month' | 'week' | 'day', anchor: Date): { from: Date; to: Date } {
  if (viewMode === 'month') {
    const days = monthGridDays(anchor);
    return { from: days[0], to: addDays(days[days.length - 1], 1) };
  }
  if (viewMode === 'week') {
    const days = weekGridDays(anchor);
    return { from: days[0], to: addDays(days[days.length - 1], 1) };
  }
  const day = startOfDay(anchor);
  return { from: day, to: addDays(day, 1) };
}

/** 15分単位に丸める */
export function snapTo15(minutesSinceMidnight: number): number {
  return Math.round(minutesSinceMidnight / 15) * 15;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

export { addDays, startOfDay, startOfWeek };
