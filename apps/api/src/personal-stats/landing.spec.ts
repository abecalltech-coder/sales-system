import { isLandingEditable } from './personal-stats.module';

/** 着地見込みの手入力は未来日だけ(要望: 当日を含む過去日は実績と同じ) */
describe('isLandingEditable', () => {
  it('過去日と当日は入力できず、明日以降は入力できる', () => {
    expect(isLandingEditable('2026-11-04', '2026-11-05')).toBe(false);
    expect(isLandingEditable('2026-11-05', '2026-11-05')).toBe(false);
    expect(isLandingEditable('2026-11-06', '2026-11-05')).toBe(true);
    expect(isLandingEditable('2026-12-01', '2026-11-30')).toBe(true);
  });
});
