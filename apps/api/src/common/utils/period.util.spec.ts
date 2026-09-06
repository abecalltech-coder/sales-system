import {
  toPeriodMonth,
  currentPeriodMonth,
  isValidPeriodMonth,
  periodMonthRange,
  previousPeriodMonth,
  nextPeriodMonth,
  periodMonthDays,
} from './period.util';

describe('period.util', () => {
  describe('toPeriodMonth (JST暦月)', () => {
    it('JST月初の直前・直後で月が切り替わる', () => {
      // 2026-09-01 00:00:00 JST = 2026-08-31 15:00:00 UTC
      expect(toPeriodMonth(new Date('2026-08-31T15:00:00Z'))).toBe('2026-09');
      expect(toPeriodMonth(new Date('2026-08-31T14:59:59Z'))).toBe('2026-08');
    });

    it('UTCでは前日でもJSTで当月ならその月になる', () => {
      // 2026-09-30 23:30 JST = 2026-09-30 14:30 UTC
      expect(toPeriodMonth(new Date('2026-09-30T14:30:00Z'))).toBe('2026-09');
    });
  });

  describe('periodMonthRange', () => {
    it('start/end がJST月初・翌月初のUTC瞬間になる', () => {
      const { start, end } = periodMonthRange('2026-09');
      expect(start.toISOString()).toBe('2026-08-31T15:00:00.000Z');
      expect(end.toISOString()).toBe('2026-09-30T15:00:00.000Z');
    });

    it('12月は翌年1月初が end になる', () => {
      const { end } = periodMonthRange('2026-12');
      expect(end.toISOString()).toBe('2026-12-31T15:00:00.000Z');
    });
  });

  describe('previous / next PeriodMonth', () => {
    it('年をまたぐ', () => {
      expect(previousPeriodMonth('2026-01')).toBe('2025-12');
      expect(nextPeriodMonth('2026-12')).toBe('2027-01');
    });
    it('月内の増減', () => {
      expect(previousPeriodMonth('2026-09')).toBe('2026-08');
      expect(nextPeriodMonth('2026-09')).toBe('2026-10');
    });
  });

  describe('periodMonthDays', () => {
    it('平年2月は28日、閏年2月は29日', () => {
      expect(periodMonthDays('2026-02')).toHaveLength(28);
      expect(periodMonthDays('2028-02')).toHaveLength(29);
      expect(periodMonthDays('2026-02')[0]).toBe('2026-02-01');
      expect(periodMonthDays('2026-01')[30]).toBe('2026-01-31');
    });
  });

  describe('isValidPeriodMonth', () => {
    it.each([
      ['2026-09', true],
      ['2026-13', false],
      ['2026-00', false],
      ['2026-9', false],
      ['not-a-month', false],
      [undefined, false],
    ])('%s -> %s', (input, expected) => {
      expect(isValidPeriodMonth(input as string)).toBe(expected);
    });
  });

  it('currentPeriodMonth は "YYYY-MM" 形式', () => {
    expect(isValidPeriodMonth(currentPeriodMonth())).toBe(true);
  });
});
