import { markManual, mergeImported } from './import-merge';

describe('一括投入で既存の案件へ入れる決まり', () => {
  it('手打ちの値は絶対に上書きしない', () => {
    const r = mergeImported({ status: '手打ち' }, [], { status: '取り込み' });
    expect(r.values.status).toBe('手打ち');
    expect(r.protectedKeys).toEqual(['status']);
    expect(r.changed).toEqual([]);
  });

  it('空欄は一括投入の値で埋める(以後は一括投入の値として扱う)', () => {
    const r = mergeImported({ name: 'A' }, [], { mc: '2026-10-01' });
    expect(r.values).toEqual({ name: 'A', mc: '2026-10-01' });
    expect(r.importedKeys).toEqual(['mc']);
    expect(r.changed).toEqual(['mc']);
  });

  it('前回も一括投入で入った値は新しい一括投入で更新する', () => {
    const r = mergeImported({ status: '旧' }, ['status'], { status: '新' });
    expect(r.values.status).toBe('新');
    expect(r.changed).toEqual(['status']);
  });

  it('一括投入の空欄で既存の値を消さない', () => {
    const r = mergeImported({ status: '旧' }, ['status'], { status: '' });
    expect(r.values.status).toBe('旧');
  });

  it('手で編集した項目は一括投入の値から外れ、以後守られる', () => {
    const keys = markManual(['status', 'mc'], ['status']);
    expect(keys).toEqual(['mc']);
    const r = mergeImported({ status: '手で直した', mc: 'x' }, keys, { status: '取り込み', mc: 'y' });
    expect(r.values).toEqual({ status: '手で直した', mc: 'y' });
  });
});
