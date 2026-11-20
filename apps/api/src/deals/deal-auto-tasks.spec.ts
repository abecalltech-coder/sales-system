import { dayAt10Jst } from './deal-auto-tasks';

describe('店サポ解約誘導のタスク期日', () => {
  it('SW日(日付列は日本時間0時)→ その日の 10:00(日本時間)', () => {
    // 2026-11-25 0:00 JST
    expect(dayAt10Jst('2026-11-24T15:00:00.000Z')?.toISOString()).toBe('2026-11-25T01:00:00.000Z');
  });

  it('SW日が無い・読めない時は作らない', () => {
    expect(dayAt10Jst(null)).toBeNull();
    expect(dayAt10Jst('')).toBeNull();
    expect(dayAt10Jst('x')).toBeNull();
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
