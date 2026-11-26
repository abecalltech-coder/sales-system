import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { todayKeyJst } from './personal-stats/apStats';

/**
 * サマリーの「部署ストーリー」(要望: 部署ごとの週表。日曜始まり、日付の数字はすべて手打ち)。
 * - 日付の数字: 今日まで=実績(緑)、明日以降=予定(白)。同じ欄に打ち、その日になったら実績として打ち直す
 * - 灰色の日: 休みの日(土日は初期で灰色。日付を押して切り替え)。灰色の日にも数字は入れられ、数字は集計に入れるが、あるべき姿の稼働日には数えない
 * - 実績 = 週小計(今日までの合計)/合計(累計)
 * - ストーリー = 週小計(実績+今後の予定)/当初合計(その累計)/あるべき姿(月の目標÷月の稼働日数×その週までの稼働日数)
 * - あるべき姿は一番下の週の枠に月の目標を打つ(他の週は自動)
 * 数字は個人別数値の部署ストーリーとは別(同じ表 DepartmentStoryValue の sd:/sg:/st: セル)。
 */

const ROWS = [
  { key: 'TOSS_UP', label: 'トスアップ数' },
  { key: 'APPOINTMENT', label: 'アポイント数' },
  { key: 'MEETING', label: '商談実施数' },
  { key: 'JUSETSU_OK', label: '重説OK数' },
  { key: 'ET', label: 'ET数' },
] as const;
type RowKey = (typeof ROWS)[number]['key'];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const SAVE_DELAY_MS = 500;

interface StoryData {
  month: string;
  days: string[];
  values: Record<string, { value: number; version: number }>;
}

/** 日曜始まりの週に分ける。月の外の日は null */
function weeksOf(days: string[]): (string | null)[][] {
  if (days.length === 0) return [];
  const [y, m, d] = days[0].split('-').map(Number);
  const lead = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 日曜=0
  const cells: (string | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

export function SummaryStory({ departments, month }: { departments: { id: string; name: string }[]; month: string }) {
  const [deptId, setDeptId] = useState(departments[0]?.id ?? '');
  useEffect(() => {
    if (!departments.some((d) => d.id === deptId)) setDeptId(departments[0]?.id ?? '');
  }, [departments, deptId]);
  const dept = departments.find((d) => d.id === deptId);
  if (!dept) return null;
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ fontSize: 14 }}>【{dept.name} ストーリー】</h2>
        {departments.length > 1 && (
          <select value={deptId} onChange={(e) => setDeptId(e.target.value)} style={{ fontSize: 12, padding: '2px 6px' }}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
          数字はすべて手打ち。日付を押すと灰色(休み)に切り替え。あるべき姿は一番下の枠に月の目標を入れる
        </span>
      </div>
      <StoryTable departmentId={dept.id} month={month} />
    </section>
  );
}

function StoryTable({ departmentId, month }: { departmentId: string; month: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['personal-stats', 'story', departmentId, month];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => api.get<StoryData>(`/personal-stats/story?departmentId=${encodeURIComponent(departmentId)}&month=${month}`),
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const timers = useRef<Record<string, number>>({});
  const chains = useRef<Record<string, Promise<void>>>({});
  useEffect(() => setDrafts({}), [departmentId, month]);

  const clearDraft = (cell: string, typed: string) =>
    setDrafts((d) => {
      if (d[cell] !== typed) return d;
      const { [cell]: _, ...rest } = d;
      return rest;
    });

  /** セルの保存(同じセルは順番に、version で他の人との重なりを検出) */
  const persist = (cell: string, getValue: () => number | null, done?: (v: number | null) => void) => {
    chains.current[cell] = (chains.current[cell] ?? Promise.resolve())
      .then(async () => {
        const current = queryClient.getQueryData<StoryData>(queryKey)?.values[cell];
        const value = getValue();
        if ((current?.value ?? null) === value) return done?.(value);
        try {
          const saved = await api.put<{ value: number; version: number } | null>('/personal-stats/story', {
            departmentId,
            month,
            cell,
            value,
            version: current?.version ?? null,
          });
          queryClient.setQueryData<StoryData>(queryKey, (old) => {
            if (!old) return old;
            const values = { ...old.values };
            if (saved) values[cell] = saved;
            else delete values[cell];
            return { ...old, values };
          });
        } catch (e) {
          alert(e instanceof ApiError ? e.message : '保存に失敗しました');
          queryClient.invalidateQueries({ queryKey: ['personal-stats', 'story'] });
        }
        done?.(value);
      })
      .catch(() => undefined);
  };

  const setCell = (cell: string, typed: string) => {
    const clean = typed.replace(/[^\d]/g, '');
    setDrafts((d) => ({ ...d, [cell]: clean }));
    window.clearTimeout(timers.current[cell]);
    timers.current[cell] = window.setTimeout(() => {
      persist(
        cell,
        () => {
          const latest = draftsRef.current[cell] ?? clean;
          return latest === '' ? null : Number(latest);
        },
        () => clearDraft(cell, draftsRef.current[cell] ?? clean),
      );
    }, SAVE_DELAY_MS);
  };

  const weeks = useMemo(() => weeksOf(data?.days ?? []), [data?.days]);
  const today = todayKeyJst();

  if (isLoading) return <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>;
  if (error || !data) return <p style={{ fontSize: 13, color: 'var(--color-danger)' }}>{error instanceof ApiError ? error.message : '読み込めませんでした'}</p>;

  const text = (cell: string) => drafts[cell] ?? (data.values[cell] ? String(data.values[cell].value) : '');
  const num = (cell: string) => Number(text(cell) || 0);
  const dayCell = (d: string, m: RowKey) => `sd:${d}:${m}`;
  const goalCell = (m: RowKey) => `st:${m}`;
  /** 灰色の日: 保存された切り替えがあればそれ、無ければ土日 */
  const isGray = (d: string) => {
    const v = data.values[`sg:${d}`];
    return v ? v.value === 1 : dow(d) === 0 || dow(d) === 6;
  };
  const toggleGray = (d: string) => {
    const next = isGray(d) ? 0 : 1;
    persist(`sg:${d}`, () => next);
  };

  /** 曜日でまとめて切り替え(要望: 灰色は部署・月・日付ごとに決める。まとめて直したいときの近道。結果は日付ごとに保存され、あとから1日ずつ直せる) */
  const weekdayAllGray = (w: number) => {
    const ds = data.days.filter((d) => dow(d) === w);
    return ds.length > 0 && ds.every((d) => isGray(d));
  };
  const toggleWeekday = (w: number) => {
    const next = weekdayAllGray(w) ? 0 : 1;
    for (const d of data.days.filter((x) => dow(x) === w)) persist(`sg:${d}`, () => next);
  };

  const inMonth = weeks.map((w) => w.filter((d): d is string => !!d));
  const workdays = inMonth.map((w) => w.filter((d) => !isGray(d)).length);
  const monthWorkdays = workdays.reduce((a, b) => a + b, 0);
  const cumWorkdays = (wi: number) => workdays.slice(0, wi + 1).reduce((a, b) => a + b, 0);

  const actualWeek = (wi: number, m: RowKey) => inMonth[wi].filter((d) => d <= today).reduce((a, d) => a + num(dayCell(d, m)), 0);
  const hasActualWeek = (wi: number) => inMonth[wi].some((d) => d <= today);
  const actualCum = (wi: number, m: RowKey) => inMonth.slice(0, wi + 1).reduce((a, _w, i) => a + actualWeek(i, m), 0);
  const storyWeek = (wi: number, m: RowKey) => inMonth[wi].reduce((a, d) => a + num(dayCell(d, m)), 0);
  const storyCum = (wi: number, m: RowKey) => inMonth.slice(0, wi + 1).reduce((a, _w, i) => a + storyWeek(i, m), 0);
  /** あるべき姿 = 月の目標 ÷ 月の稼働日数 × その週までの稼働日数(四捨五入) */
  const ideal = (wi: number, m: RowKey) => (monthWorkdays > 0 && text(goalCell(m)) !== '' ? Math.round((num(goalCell(m)) * cumWorkdays(wi)) / monthWorkdays) : null);
  const anyActual = weeks.some((_w, wi) => hasActualWeek(wi));

  const input = (cell: string, bg: string, bold = false) => (
    <input
      inputMode="numeric"
      value={text(cell)}
      onChange={(e) => setCell(cell, e.target.value)}
      style={{
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        textAlign: 'center',
        padding: '4px 2px',
        fontSize: 12,
        fontWeight: bold ? 700 : 600,
        border: 'none',
        background: bg,
        borderRadius: 0,
        boxShadow: 'none',
      }}
    />
  );

  const th: React.CSSProperties = {
    padding: '4px 4px',
    fontSize: 11,
    fontWeight: 700,
    background: 'var(--color-subtle)',
    border: '1px solid var(--color-border)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = { padding: 0, border: '1px solid var(--color-border)', textAlign: 'center', fontSize: 12, whiteSpace: 'nowrap', minWidth: 46 };
  const calc: React.CSSProperties = { ...td, padding: '4px 6px', fontWeight: 700 };
  const GRAY = 'var(--color-border-strong)';
  const ACTUAL = 'var(--color-success-soft)';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 6, fontSize: 11, color: 'var(--color-text-muted)' }}>
        <span>この月の灰色(休み)を曜日でまとめて切り替え:</span>
        {WEEKDAYS.map((label, w) => {
          const on = weekdayAllGray(w);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleWeekday(w)}
              title={on ? `${label}曜をすべて稼働日に戻す` : `${label}曜をすべて灰色(休み)にする`}
              style={{
                fontSize: 11,
                padding: '1px 8px',
                background: on ? 'var(--color-border-strong)' : 'var(--color-surface)',
              }}
            >
              {label}
            </button>
          );
        })}
        <span>(日付を押せば1日ずつも切り替え。部署・月ごとに保存)</span>
      </div>
    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 840 }}>
        {/* 要望: 実績とストーリーの5列は全部同じ幅、日付の7列も同じ幅 */}
        <colgroup>
          <col style={{ width: 84 }} />
          {WEEKDAYS.map((w) => (
            <col key={w} style={{ width: 52 }} />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <col key={i} style={{ width: 68 }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, minWidth: 84 }}>曜日</th>
            {WEEKDAYS.map((w) => (
              <th key={w} style={th}>
                {w}
              </th>
            ))}
            <th style={{ ...th, background: 'var(--color-primary-soft)' }} colSpan={2}>
              実績
            </th>
            <th style={{ ...th, background: 'var(--color-warning-soft)' }} colSpan={3}>
              ストーリー
            </th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, wi) => {
            const isLast = wi === weeks.length - 1;
            return (
              <Fragment key={wi}>
                {/* 週の見出し行: 第N週 / 日付(押すと灰色に切り替え) / 小計の見出し */}
                <tr>
                  <th style={{ ...th, background: 'var(--color-primary-soft)' }}>第{wi + 1}週</th>
                  {w.map((d, i) =>
                    d ? (
                      <th key={i} style={{ ...th, padding: 0, background: isGray(d) ? GRAY : 'var(--color-primary-soft)' }}>
                        <button
                          type="button"
                          onClick={() => toggleGray(d)}
                          title={isGray(d) ? '押すと稼働日に戻す' : '押すと灰色(休み)にする'}
                          style={{ width: '100%', border: 'none', background: 'transparent', boxShadow: 'none', padding: '4px 2px', fontSize: 11, fontWeight: 700, borderRadius: 0 }}
                        >
                          {md(d)}
                        </button>
                      </th>
                    ) : (
                      <th key={i} style={{ ...th, background: GRAY }} />
                    ),
                  )}
                  <th style={th}>週小計</th>
                  <th style={th}>合計</th>
                  <th style={th}>週小計</th>
                  <th style={th}>当初合計</th>
                  <th style={th}>あるべき姿</th>
                </tr>
                {ROWS.map((r) => (
                  <tr key={r.key}>
                    <td style={{ ...calc, textAlign: 'left', fontSize: 11 }}>{r.label}</td>
                    {w.map((d, i) =>
                      d ? (
                        <td key={i} style={td}>
                          {input(dayCell(d, r.key), isGray(d) ? GRAY : d <= today ? ACTUAL : 'transparent')}
                        </td>
                      ) : (
                        <td key={i} style={{ ...td, background: GRAY }} />
                      ),
                    )}
                    <td style={calc}>{hasActualWeek(wi) ? actualWeek(wi, r.key) : ''}</td>
                    <td style={calc}>{anyActual ? actualCum(wi, r.key) : ''}</td>
                    <td style={calc}>{storyWeek(wi, r.key)}</td>
                    <td style={calc}>{storyCum(wi, r.key)}</td>
                    {isLast ? (
                      <td style={{ ...td, background: 'var(--color-warning-soft)' }} title="月の目標(この数字から各週のあるべき姿を自動計算)">
                        {input(goalCell(r.key), 'transparent', true)}
                      </td>
                    ) : (
                      <td style={calc}>{ideal(wi, r.key) ?? ''}</td>
                    )}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );

}
