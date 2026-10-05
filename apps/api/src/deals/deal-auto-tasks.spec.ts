import { dayAt10Jst, shopSupportDueAt } from './deal-auto-tasks';

describe('店サポ解約誘導のタスク期日', () => {
  it('MC日の月の4ヶ月後の1日 10:00(日本時間)', () => {
    // MC日 2026/10/5(日本時間0時で保存)→ 2027/2/1 10:00 JST = 2027-02-01T01:00Z
    expect(shopSupportDueAt('2026-10-04T15:00:00.000Z')?.toISOString()).toBe('2027-02-01T01:00:00.000Z');
  });

  it('日本時間で月初の日付も、その月で数える', () => {
    // MC日 2026/10/1(UTCでは9/30)→ 2027/2/1
    expect(shopSupportDueAt('2026-09-30T15:00:00.000Z')?.toISOString()).toBe('2027-02-01T01:00:00.000Z');
  });

  it('年をまたぐ', () => {
    // MC日 2026/9/15 → 2027/1/1
    expect(shopSupportDueAt('2026-09-14T15:00:00.000Z')?.toISOString()).toBe('2027-01-01T01:00:00.000Z');
  });

  it('MC日が無い・読めない時は作らない', () => {
    expect(shopSupportDueAt(null)).toBeNull();
    expect(shopSupportDueAt('x')).toBeNull();
  });
});

describe('ファクタ回収のタスク期日', () => {
  it('日付列の値(日本時間0時)→ その日の10:00', () => {
    expect(dayAt10Jst('2026-10-19T15:00:00.000Z')?.toISOString()).toBe('2026-10-20T01:00:00.000Z');
  });
  it('文字の日付も読む', () => {
    const now = new Date('2026-10-06T00:00:00Z');
    expect(dayAt10Jst('2026/10/20', now)?.toISOString()).toBe('2026-10-20T01:00:00.000Z');
    expect(dayAt10Jst('10/20', now)?.toISOString()).toBe('2026-10-20T01:00:00.000Z');
    expect(dayAt10Jst('未定', now)).toBeNull();
    expect(dayAt10Jst('', now)).toBeNull();
  });
});
