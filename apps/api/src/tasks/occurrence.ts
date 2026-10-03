/**
 * タスクの「回」の計算(繰り返し)。
 * 期日(dueAt)を起点に、月毎/週毎/日毎/曜日毎/時間毎 に次の回を求める。時刻は JST の壁時計で扱う
 * (毎月25日 10:00 → 翌月25日 10:00)。サーバーの TZ に依存しないよう JST を UTC+9 として計算する。
 */
export type RepeatType = 'NONE' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'WEEKDAYS' | 'HOURLY';

export interface RepeatRule {
  dueAt: Date | null;
  repeatType: string;
  repeatInterval: number;
  repeatWeekdays: number[];
  repeatUntil: Date | null;
}

/** 期日なしのタスクの「回」(完了の印) */
export const NO_DUE = new Date(0);

const JST = 9 * 3600_000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const MAX_STEPS = 5000;

const jstParts = (d: Date) => {
  const j = new Date(d.getTime() + JST);
  return { y: j.getUTCFullYear(), m: j.getUTCMonth(), day: j.getUTCDate(), h: j.getUTCHours(), mi: j.getUTCMinutes(), dow: j.getUTCDay() };
};
const fromJst = (y: number, m: number, day: number, h: number, mi: number) => new Date(Date.UTC(y, m, day, h, mi) - JST);

/** 起点から n 回目(0 = 起点) */
function nth(rule: RepeatRule, n: number): Date {
  const start = rule.dueAt!;
  const k = Math.max(1, rule.repeatInterval || 1);
  switch (rule.repeatType) {
    case 'HOURLY':
      return new Date(start.getTime() + n * k * HOUR);
    case 'DAILY':
      return new Date(start.getTime() + n * k * DAY);
    case 'WEEKLY':
      return new Date(start.getTime() + n * k * 7 * DAY);
    case 'MONTHLY': {
      const p = jstParts(start);
      const total = p.m + n * k;
      const y = p.y + Math.floor(total / 12);
      const m = ((total % 12) + 12) % 12;
      // 31日→30日までの月など、存在しない日は月末に寄せる
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      return fromJst(y, m, Math.min(p.day, last), p.h, p.mi);
    }
    default:
      return start;
  }
}

/**
 * after より後の最初の回(after が null なら最初の回)。終わっていれば null。
 * 繰り返し無しは「起点」だけ。期日なしは NO_DUE。
 */
export function nextOccurrence(rule: RepeatRule, after: Date | null): Date | null {
  if (!rule.dueAt) return after ? null : NO_DUE;
  const type = rule.repeatType as RepeatType;
  const within = (d: Date | null) => (d && rule.repeatUntil && d.getTime() > endOfDayJst(rule.repeatUntil).getTime() ? null : d);

  if (type === 'NONE' || !type) return after ? null : rule.dueAt;
  if (!after || after.getTime() < rule.dueAt.getTime()) return within(firstValid(rule));

  if (type === 'WEEKDAYS') {
    const days = (rule.repeatWeekdays ?? []).filter((x) => x >= 0 && x <= 6);
    if (days.length === 0) return null;
    const p = jstParts(rule.dueAt);
    const a = jstParts(after);
    // after の日から1日ずつ進めて、指定曜日の同じ時刻で after より後のもの
    for (let i = 0; i <= 8; i++) {
      const cand = fromJst(a.y, a.m, a.day + i, p.h, p.mi);
      if (cand.getTime() > after.getTime() && days.includes(jstParts(cand).dow)) return within(cand);
    }
    return null;
  }

  // 一定間隔の型: 回数を見積もってから前後を確かめる(長期間でも速い)
  const approxStep = { HOURLY: HOUR, DAILY: DAY, WEEKLY: 7 * DAY, MONTHLY: 28 * DAY }[type as 'HOURLY'] * Math.max(1, rule.repeatInterval || 1);
  let n = Math.max(0, Math.floor((after.getTime() - rule.dueAt.getTime()) / approxStep) - 2);
  for (let i = 0; i < MAX_STEPS; i++, n++) {
    const d = nth(rule, n);
    if (d.getTime() > after.getTime()) return within(d);
  }
  return null;
}

/** 曜日毎は、起点の日が指定曜日でなければ次の指定曜日が最初の回 */
function firstValid(rule: RepeatRule): Date {
  if (rule.repeatType !== 'WEEKDAYS') return rule.dueAt!;
  const days = rule.repeatWeekdays ?? [];
  const p = jstParts(rule.dueAt!);
  for (let i = 0; i < 7; i++) {
    const cand = fromJst(p.y, p.m, p.day + i, p.h, p.mi);
    if (days.includes(jstParts(cand).dow)) return cand;
  }
  return rule.dueAt!;
}

function endOfDayJst(d: Date): Date {
  const p = jstParts(d);
  return fromJst(p.y, p.m, p.day, 23, 59);
}
