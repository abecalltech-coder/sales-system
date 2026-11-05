import { PersonalDailyKey } from '../../hooks/useApi';
import { rateOf } from './parts';

/**
 * アポインターのシートの累計計算(シート上部と部署サマリーで同じ計算を使う)。
 * - 稼働時間は月初に予定として全部入れるため、今日までの日だけ数える(要望)
 * - 予算は月初予算。着地見込みは今日までは実績、明日以降は手入力(landingOf)
 */

export const SEAT_HOURS = 176;
export const PLAN_METRICS = [
  { key: 'TOSS_UP', label: 'トス', budget: 'TOSS_UP_BUDGET', revised: 'TOSS_UP_REVISED' },
  { key: 'APPOINTMENT', label: 'アポ', budget: 'APPOINTMENT_BUDGET', revised: 'APPOINTMENT_REVISED' },
] as const;
export type PlanMetric = (typeof PLAN_METRICS)[number];

export interface DayGetter {
  value: (d: string, key: PersonalDailyKey) => number;
  /** 手入力があるか(未来日の着地見込みの判定に使う) */
  entered: (d: string, key: PersonalDailyKey) => boolean;
}

export const fmtMinutes = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
export const fmtSeats = (min: number, digits: number) => (min > 0 ? (min / 60 / SEAT_HOURS).toFixed(digits) : '');

export function todayKeyJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 今日までの日か(過去の月は全部、先の月は無し) */
export const isCounted = (d: string, today: string) => d <= today;

export const planOf = (g: DayGetter, d: string, m: PlanMetric) => g.value(d, m.budget);

/**
 * 1日の着地見込み(要望: 当日を含む過去日は実績と同じ、未来日は手打ちできる)。
 * 今日までは実績(無ければ0)、明日以降は手入力があればそれ、無ければ月初予算
 */
export const landingOf = (g: DayGetter, d: string, m: PlanMetric, today: string) => {
  if (d <= today) return g.value(d, m.key);
  return g.entered(d, m.revised) ? g.value(d, m.revised) : g.value(d, m.budget);
};

export const LANDING_HELP = '着地見込み = 今日までは実績、明日以降は手入力(無ければ月初予算)';

const sum = (ds: string[], f: (d: string) => number) => ds.reduce((a, d) => a + f(d), 0);

export function computeApSummary(days: string[], today: string, g: DayGetter) {
  const counted = days.filter((d) => isCounted(d, today));
  const remaining = days.filter((d) => d >= today);
  const hours = (d: string) => g.value(d, 'WORK_MINUTES');

  const workMin = sum(counted, hours);
  const workedDays = counted.filter((d) => hours(d) > 0).length;

  // 残日数: 今日以降の稼働予定日(稼働時間が入っている日)。稼働予定が無ければ予算の入っている日、それも無ければ月末までの日数
  const restDays = days.some((d) => hours(d) > 0)
    ? remaining.filter((d) => hours(d) > 0).length
    : days.some((d) => PLAN_METRICS.some((m) => planOf(g, d, m) > 0))
      ? remaining.filter((d) => PLAN_METRICS.some((m) => planOf(g, d, m) > 0)).length
      : remaining.length;

  const stats = PLAN_METRICS.map((m) => {
    const actual = sum(days, (d) => g.value(d, m.key));
    const plan = sum(days, (d) => planOf(g, d, m));
    const landing = sum(days, (d) => landingOf(g, d, m, today));
    const planToDate = sum(counted, (d) => planOf(g, d, m));
    const rest = Math.max(0, plan - actual);
    return {
      ...m,
      actual,
      plan,
      landing,
      planToDate,
      rest,
      perDay: restDays > 0 ? rest / restDays : null,
      avg: workedDays > 0 ? actual / workedDays : null,
      // 進捗: 今日までの予算(=今日時点で100%の数)に対する実績
      progress: rateOf(actual, planToDate || null),
    };
  });
  return { workMin, workedDays, restDays, stats };
}
