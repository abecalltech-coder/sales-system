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
 * 今日までは実績、明日以降は手入力の数字(どちらも無ければ0)
 */
export const landingOf = (g: DayGetter, d: string, m: PlanMetric, today: string) => g.value(d, d <= today ? m.key : m.revised);

export const LANDING_HELP = '着地見込み = 今日までは実績、明日以降は手入力の数字';

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

// ---- 流れ(コール数 → 有効 → 接触 → 主旨NG → クロージングNG → トスアップ → アポイント) ----
// 各項目は「その段階まで進んだ数」。率は一つ前の項目に対する割合。

export const FUNNEL = [
  { key: 'CALLS', label: 'コール数', short: 'コール' },
  { key: 'VALID', label: '有効数', short: '有効' },
  { key: 'CONTACT', label: 'オーナー接触数', short: '接触' },
  { key: 'SHUSHI_NG', label: '主旨NG', short: '主旨NG' },
  { key: 'CLOSING_NG', label: 'クロージングNG', short: 'CLNG' },
  { key: 'TOSS_UP', label: 'トスアップ', short: 'トス' },
  { key: 'APPOINTMENT', label: 'アポイント', short: 'アポ' },
] as const;
/** i 番目の率 = FUNNEL[i+1] ÷ FUNNEL[i] */
export const FUNNEL_RATE_LABELS = ['有効率', 'オーナー接触率', '主旨NG率', 'クロージングNG率', 'トスアップ率', 'アポイント率'];
export const FUNNEL_RATE_SHORT = ['有効率', '接触率', '主旨率', 'CL率', 'トス率', 'アポ率'];

/** 必要件数の見方: 1日 / 今日まで累計 / 月末まで残り */
export type NeedMode = 'day' | 'cum' | 'rest';
/** 逆算のもとにする予算 */
export type NeedBase = 'toss' | 'appo';

/** 割合(0〜1)。分母が0なら null */
export const ratioOf = (num: number, den: number) => (den > 0 ? num / den : null);

/** 率(%)が指標(%)に届いているか。どちらかが無ければ null */
export function reachedBenchmark(rate: number | null, benchmark: number | null | undefined): boolean | null {
  if (rate == null || benchmark == null) return null;
  return rate * 100 >= benchmark;
}

/**
 * 流れの累計と、予算からの逆算(要望)。
 * 累計は今日までの日だけ。必要件数は、予算の件数を今の率(月初〜今日の累計)でさかのぼって出す:
 * 例) アポ予算1件 ÷ アポイント率 = 必要なトスアップ数 → ÷ トスアップ率 = 必要なクロージングNG … コール数まで。
 */
export function computeFunnel(days: string[], today: string, g: DayGetter, mode: NeedMode, base: NeedBase) {
  const counted = days.filter((d) => isCounted(d, today));
  const ref = days.includes(today) ? today : days[days.length - 1];
  const cum = FUNNEL.map((f) => sum(counted, (d) => g.value(d, f.key)));
  const refVals = FUNNEL.map((f) => (ref ? g.value(ref, f.key) : 0));
  const rates = cum.map((v, i) => (i === 0 ? null : ratioOf(v, cum[i - 1])));

  const startIdx = base === 'toss' ? 5 : 6;
  const metric = PLAN_METRICS[base === 'toss' ? 0 : 1];
  const monthPlan = sum(days, (d) => planOf(g, d, metric));
  const budget =
    mode === 'day'
      ? ref
        ? planOf(g, ref, metric)
        : 0
      : mode === 'cum'
        ? sum(counted, (d) => planOf(g, d, metric))
        : Math.max(0, monthPlan - cum[startIdx]);

  const need: (number | null)[] = FUNNEL.map(() => null);
  need[startIdx] = budget;
  for (let i = startIdx; i >= 1; i--) {
    const r = rates[i];
    need[i - 1] = r ? (need[i] as number) / r : null;
  }
  return { cum, refVals, rates, need, budget, monthPlan, startIdx };
}
