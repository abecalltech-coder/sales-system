/**
 * 「対象月(periodMonth)」= JST暦月を "YYYY-MM" の文字列で扱うためのユーティリティ。
 *
 * DBのDateTimeはすべてUTCで保存されている。日本にはサマータイムが無いため、
 * JSTは常にUTC+09:00固定で計算してよい(date-fns-tz 等は不要)。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 任意の日時を JST の "YYYY-MM" に変換する */
export function toPeriodMonth(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** 現在(JST)の対象月 */
export function currentPeriodMonth(now: Date = new Date()): string {
  return toPeriodMonth(now);
}

/** "YYYY-MM" として妥当か */
export function isValidPeriodMonth(period: unknown): period is string {
  return typeof period === 'string' && PERIOD_RE.test(period);
}

function parsePeriod(period: string): { year: number; month: number } {
  if (!isValidPeriodMonth(period)) {
    throw new Error(`不正な対象月です: ${period}`);
  }
  const [y, m] = period.split('-').map(Number);
  return { year: y, month: m };
}

/**
 * 対象月に対応する [start, end) のUTC瞬間を返す。
 * start = その月のJST 1日 00:00:00、end = 翌月のJST 1日 00:00:00。
 * `where: { receivedAt: { gte: start, lt: end } }` の形で使う。
 */
export function periodMonthRange(period: string): { start: Date; end: Date } {
  const { year, month } = parsePeriod(period);
  // JST壁時計の月初を、UTC瞬間に直す(JST 00:00 は UTC 前日15:00)
  const start = new Date(Date.UTC(year, month - 1, 1) - JST_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - JST_OFFSET_MS);
  return { start, end };
}

/** 前の対象月 */
export function previousPeriodMonth(period: string): string {
  const { year, month } = parsePeriod(period);
  const d = new Date(Date.UTC(year, month - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 次の対象月 */
export function nextPeriodMonth(period: string): string {
  const { year, month } = parsePeriod(period);
  const d = new Date(Date.UTC(year, month, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 対象月の日付一覧を "YYYY-MM-DD"[] で返す(シフト表の日別列生成用) */
export function periodMonthDays(period: string): string[] {
  const { year, month } = parsePeriod(period);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    out.push(`${period}-${String(d).padStart(2, '0')}`);
  }
  return out;
}
