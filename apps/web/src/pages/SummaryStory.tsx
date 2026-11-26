import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { todayKeyJst } from './personal-stats/apStats';
import { fmtRate, rateColor, rateOf } from './personal-stats/parts';

/** 部署ごとの色(要望: 直販・CH東・CH西・CT東で色を変える)。soft=稼働した日、mid=週が終わったときの塗りつぶし */
export const STORY_COLORS: Record<string, { soft: string; mid: string }> = {
  直販ALL: { soft: '#ece4f7', mid: '#c9b6e8' },
  CH東: { soft: '#dbeafe', mid: '#9cc3f5' },
  CH西: { soft: '#d9f2e1', mid: '#97d7ad' },
  CT東: { soft: '#fde5cc', mid: '#f5bd85' },
};
const RED = '2px solid #d32f2f';

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

/**
 * departmentIds が1つなら入力できる表、複数なら各部署の数字を足した表示専用(直販ALL)。
 */
export function StoryTable({ departmentIds, month, color }: { departmentIds: string[]; month: string; color: { soft: string; mid: string } }) {
  const queryClient = useQueryClient();
  const editable = departmentIds.length === 1;
  const departmentId = departmentIds[0] ?? '';
  const queryKey = ['personal-stats', 'story', departmentId, month];
  const results = useQueries({
    queries: departmentIds.map((id) => ({
      queryKey: ['personal-stats', 'story', id, month],
      queryFn: () => api.get<StoryData>(`/personal-stats/story?departmentId=${encodeURIComponent(id)}&month=${month}`),
    })),
  });
  const isLoading = results.some((r) => r.isLoading);
  const error = results.find((r) => r.error)?.error;
  const datas = results.map((r) => r.data).filter((d): d is StoryData => !!d);
  const data = datas[0];

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const timers = useRef<Record<string, number>>({});
  const chains = useRef<Record<string, Promise<void>>>({});
  useEffect(() => setDrafts({}), [departmentId, month]);
  const persistOk = editable;

  const clearDraft = (cell: string, typed: string) =>
    setDrafts((d) => {
      if (d[cell] !== typed) return d;
      const { [cell]: _, ...rest } = d;
      return rest;
    });

  /** セルの保存(同じセルは順番に、version で他の人との重なりを検出) */
  const persist = (cell: string, getValue: () => number | null, done?: (v: number | null) => void) => {
    if (!persistOk) return;
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
  if (error || !data || datas.length !== departmentIds.length) return <p style={{ fontSize: 13, color: 'var(--color-danger)' }}>{error instanceof ApiError ? error.message : '読み込めませんでした'}</p>;

  const sumOf = (cell: string) => datas.reduce((a, x) => a + (x.values[cell]?.value ?? 0), 0);
  const has = (cell: string) => datas.some((x) => x.values[cell]);
  const text = (cell: string) => (editable ? (drafts[cell] ?? (data.values[cell] ? String(data.values[cell].value) : '')) : has(cell) ? String(sumOf(cell)) : '');
  const num = (cell: string) => Number(text(cell) || 0);
  const dayCell = (d: string, m: RowKey) => `sd:${d}:${m}`;
  const goalCell = (m: RowKey) => `st:${m}`;
  /** 灰色の日(部署ごと): 保存された切り替えがあればそれ、無ければ土日 */
  const isGrayOf = (x: StoryData, d: string) => {
    const v = x.values[`sg:${d}`];
    return v ? v.value === 1 : dow(d) === 0 || dow(d) === 6;
  };
  /** 画面の灰色: 入力できる表はその部署の設定、直販ALLは全部署が休みの日だけ灰色 */
  const isGray = (d: string) => datas.every((x) => isGrayOf(x, d));
  const toggleGray = (d: string) => {
    const next = isGray(d) ? 0 : 1;
    persist(`sg:${d}`, () => next);
  };

  const inMonth = weeks.map((w) => w.filter((d): d is string => !!d));
  /** 部署ごとの稼働日数(あるべき姿は部署ごとに計算して足す) */
  const workdaysOf = (x: StoryData) => inMonth.map((w) => w.filter((d) => !isGrayOf(x, d)).length);

  const actualWeek = (wi: number, m: RowKey) => inMonth[wi].filter((d) => d < today).reduce((a, d) => a + num(dayCell(d, m)), 0);
  const hasActualWeek = (wi: number) => inMonth[wi].some((d) => d < today);
  const actualCum = (wi: number, m: RowKey) => inMonth.slice(0, wi + 1).reduce((a, _w, i) => a + actualWeek(i, m), 0);
  const storyWeek = (wi: number, m: RowKey) => inMonth[wi].reduce((a, d) => a + num(dayCell(d, m)), 0);
  const storyCum = (wi: number, m: RowKey) => inMonth.slice(0, wi + 1).reduce((a, _w, i) => a + storyWeek(i, m), 0);
  /** あるべき姿 = 月の目標 ÷ 月の稼働日数 × その週までの稼働日数(四捨五入) */
  const ideal = (wi: number, m: RowKey) => {
    let total: number | null = null;
    for (const x of datas) {
      const goal = x.values[goalCell(m)]?.value;
      const wd = workdaysOf(x);
      const month = wd.reduce((a, b) => a + b, 0);
      if (goal === undefined || month === 0) continue;
      const cum = wd.slice(0, wi + 1).reduce((a, b) => a + b, 0);
      total = (total ?? 0) + Math.round((goal * cum) / month);
    }
    return editable && drafts[goalCell(m)] !== undefined ? null : total;
  };
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
  const ACTUAL = color.soft;
  const weekDone = (wi: number) => inMonth[wi].length > 0 && inMonth[wi][inMonth[wi].length - 1] < today;
  const lastWi = weeks.length - 1;
  /** 実績の欄を赤い線で囲う(要望): 実績の2列の外側だけ */
  const redCell = (col: 0 | 1, edge: { top?: boolean; bottom?: boolean }): React.CSSProperties => ({
    ...(col === 0 ? { borderLeft: RED } : { borderRight: RED }),
    ...(edge.top ? { borderTop: RED } : {}),
    ...(edge.bottom ? { borderBottom: RED } : {}),
  });

  const total = (m: RowKey) => (weeks.length ? actualCum(weeks.length - 1, m) : 0);
  const goalOf = (m: RowKey) => (has(goalCell(m)) ? num(goalCell(m)) : null);
  /** 月間ストーリー(要望: 部署ごとの月の合計だけの表。月目標は下の表の一番下の枠、実績は前日までの合計) */
  const monthly = (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)', marginBottom: 8, overflowX: 'auto', maxWidth: 420 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {['月間', '月目標', '実績', '達成率', '残り'].map((h) => (
              <th key={h} style={{ ...th, background: h === '月間' ? color.mid : th.background }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const g = goalOf(r.key);
            const t = total(r.key);
            return (
              <tr key={r.key}>
                <td style={{ ...calc, textAlign: 'left', fontSize: 11, background: color.soft }}>{r.label}</td>
                <td style={calc}>{g ?? '—'}</td>
                <td style={calc}>{t}</td>
                <td style={{ ...calc, color: rateColor(rateOf(t, g)) }}>{fmtRate(rateOf(t, g))}</td>
                <td style={calc}>{g == null ? '—' : Math.max(0, g - t)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      {monthly}
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
            <th style={{ ...th, background: 'var(--color-primary-soft)', borderTop: RED, borderLeft: RED, borderRight: RED }} colSpan={2}>
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
                  <th style={{ ...th, background: color.mid }}>第{wi + 1}週</th>
                  {w.map((d, i) =>
                    d ? (
                      <th key={i} style={{ ...th, padding: 0, background: isGray(d) ? GRAY : color.soft }}>
                        <button
                          type="button"
                          disabled={!editable}
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
                  <th style={{ ...th, ...redCell(0, {}) }}>週小計</th>
                  <th style={{ ...th, ...redCell(1, {}) }}>合計</th>
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
                          {editable ? (
                            input(dayCell(d, r.key), isGray(d) ? GRAY : d < today && text(dayCell(d, r.key)) !== '' ? ACTUAL : 'transparent')
                          ) : (
                            <div style={{ padding: '4px 2px', fontWeight: 600, background: isGray(d) ? GRAY : d < today && text(dayCell(d, r.key)) !== '' ? ACTUAL : 'transparent' }}>{text(dayCell(d, r.key))}</div>
                          )}
                        </td>
                      ) : (
                        <td key={i} style={{ ...td, background: GRAY }} />
                      ),
                    )}
                    <td style={{ ...calc, ...(weekDone(wi) ? { background: color.mid } : {}), ...redCell(0, { bottom: wi === lastWi && r.key === ROWS[ROWS.length - 1].key }) }}>{hasActualWeek(wi) ? actualWeek(wi, r.key) : ''}</td>
                    <td style={{ ...calc, ...(weekDone(wi) ? { background: color.mid } : {}), ...redCell(1, { bottom: wi === lastWi && r.key === ROWS[ROWS.length - 1].key }) }}>{anyActual ? actualCum(wi, r.key) : ''}</td>
                    <td style={{ ...calc, ...(weekDone(wi) ? { background: color.mid } : {}) }}>{storyWeek(wi, r.key)}</td>
                    <td style={{ ...calc, ...(weekDone(wi) ? { background: color.mid } : {}) }}>{storyCum(wi, r.key)}</td>
                    {isLast && editable ? (
                      <td style={{ ...td, background: 'var(--color-warning-soft)' }} title="月の目標(この数字から各週のあるべき姿を自動計算)">
                        {input(goalCell(r.key), 'transparent', true)}
                      </td>
                    ) : (
                      <td style={{ ...calc, ...(weekDone(wi) ? { background: color.mid } : {}) }}>{isLast ? (has(goalCell(r.key)) ? sumOf(goalCell(r.key)) : '') : (ideal(wi, r.key) ?? '')}</td>
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
