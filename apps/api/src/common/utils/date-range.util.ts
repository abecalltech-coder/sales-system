/**
 * カスタムレポートの期間(開始日〜終了日/プリセット)をJSTで解決するユーティリティ。
 * 日本にはサマータイムが無いため、JSTは常にUTC+09:00固定で計算する(period.util.tsと同じ方針)。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD"(JST日付)のJST 00:00をUTC瞬間に変換する */
export function jstDayStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - JST_OFFSET_MS);
}

/** 任意のUTC瞬間から、そのJST日のUTC瞬間(00:00 JST)を返す */
function jstDayStartOf(date: Date): Date {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - JST_OFFSET_MS);
}

/** 任意のUTC瞬間を含む週(JST月曜始まり)の月曜0:00(UTC瞬間)を返す */
function jstMondayOf(date: Date): Date {
  const dayStart = jstDayStartOf(date);
  const jstDow = new Date(dayStart.getTime() + JST_OFFSET_MS).getUTCDay(); // 0=日,1=月...6=土
  const diffFromMonday = jstDow === 0 ? 6 : jstDow - 1;
  return new Date(dayStart.getTime() - diffFromMonday * DAY_MS);
}

export type ReportPreset = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_WEEK' | 'LAST_WEEK';

export function resolvePresetRange(preset: ReportPreset, now: Date = new Date()): { start: Date; end: Date } {
  if (preset === 'THIS_WEEK' || preset === 'LAST_WEEK') {
    const thisMonday = jstMondayOf(now);
    const start = preset === 'THIS_WEEK' ? thisMonday : new Date(thisMonday.getTime() - 7 * DAY_MS);
    const end = new Date(start.getTime() + 7 * DAY_MS);
    return { start, end };
  }
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const mo = jst.getUTCMonth(); // 0-11
  const [ty, tm] = preset === 'THIS_MONTH' ? [y, mo] : mo === 0 ? [y - 1, 11] : [y, mo - 1];
  const start = new Date(Date.UTC(ty, tm, 1) - JST_OFFSET_MS);
  const end = new Date(Date.UTC(ty, tm + 1, 1) - JST_OFFSET_MS);
  return { start, end };
}

/** JST基準の月ラベル("YYYY-MM") */
export function jstMonthLabel(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** JST基準・月曜始まりの週ラベル("YYYY-MM-DD週"、その週の月曜日) */
export function jstWeekLabel(date: Date): string {
  const monday = jstMondayOf(date);
  const jst = new Date(monday.getTime() + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}週`;
}
