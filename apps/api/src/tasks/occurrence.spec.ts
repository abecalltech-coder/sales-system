import { nextOccurrence, NO_DUE, RepeatRule } from './occurrence';

// JST の日時を作る
const jst = (s: string) => new Date(`${s}+09:00`);
const rule = (r: Partial<RepeatRule>): RepeatRule => ({ dueAt: null, repeatType: 'NONE', repeatInterval: 1, repeatWeekdays: [], repeatUntil: null, ...r });

describe('タスクの繰り返し', () => {
  it('繰り返し無し: 最初の回は期日、完了後は無し', () => {
    const r = rule({ dueAt: jst('2026-10-10T10:00:00') });
    expect(nextOccurrence(r, null)).toEqual(jst('2026-10-10T10:00:00'));
    expect(nextOccurrence(r, jst('2026-10-10T10:00:00'))).toBeNull();
  });

  it('期日なし: 完了の印', () => {
    expect(nextOccurrence(rule({}), null)).toEqual(NO_DUE);
    expect(nextOccurrence(rule({}), NO_DUE)).toBeNull();
  });

  it('日毎・週毎・時間毎', () => {
    const d = jst('2026-10-10T09:00:00');
    expect(nextOccurrence(rule({ dueAt: d, repeatType: 'DAILY' }), d)).toEqual(jst('2026-10-11T09:00:00'));
    expect(nextOccurrence(rule({ dueAt: d, repeatType: 'WEEKLY', repeatInterval: 2 }), d)).toEqual(jst('2026-10-24T09:00:00'));
    expect(nextOccurrence(rule({ dueAt: d, repeatType: 'HOURLY', repeatInterval: 3 }), jst('2026-10-10T13:00:00'))).toEqual(jst('2026-10-10T15:00:00'));
  });

  it('月毎: 同じ日・時刻、無い日は月末', () => {
    const d = jst('2026-01-31T10:00:00');
    const r = rule({ dueAt: d, repeatType: 'MONTHLY' });
    expect(nextOccurrence(r, d)).toEqual(jst('2026-02-28T10:00:00'));
    expect(nextOccurrence(r, jst('2026-02-28T10:00:00'))).toEqual(jst('2026-03-31T10:00:00'));
  });

  it('曜日毎: 指定曜日の同じ時刻', () => {
    // 2026-10-10 は土曜。月(1)・水(3)
    const r = rule({ dueAt: jst('2026-10-10T08:30:00'), repeatType: 'WEEKDAYS', repeatWeekdays: [1, 3] });
    expect(nextOccurrence(r, null)).toEqual(jst('2026-10-12T08:30:00'));
    expect(nextOccurrence(r, jst('2026-10-12T08:30:00'))).toEqual(jst('2026-10-14T08:30:00'));
    expect(nextOccurrence(r, jst('2026-10-14T08:30:00'))).toEqual(jst('2026-10-19T08:30:00'));
  });

  it('終了日を過ぎたら無し', () => {
    const r = rule({ dueAt: jst('2026-10-10T09:00:00'), repeatType: 'DAILY', repeatUntil: jst('2026-10-11T00:00:00') });
    expect(nextOccurrence(r, jst('2026-10-10T09:00:00'))).toEqual(jst('2026-10-11T09:00:00'));
    expect(nextOccurrence(r, jst('2026-10-11T09:00:00'))).toBeNull();
  });

  it('長期間たっても速く正しい回を返す', () => {
    const r = rule({ dueAt: jst('2020-01-01T00:00:00'), repeatType: 'HOURLY' });
    expect(nextOccurrence(r, jst('2026-10-10T09:30:00'))).toEqual(jst('2026-10-10T10:00:00'));
  });
});
