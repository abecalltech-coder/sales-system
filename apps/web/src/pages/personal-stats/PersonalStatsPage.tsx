import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { MonthSwitcher } from '../../components/MonthSwitcher';
import { usePeriodMonth } from '../../lib/usePeriodMonth';
import { api, ApiError } from '../../lib/api';
import {
  PersonalMetricKey,
  PersonalStatTarget,
  PersonalStatsSheet,
  useMe,
  usePersonalStats,
  usePersonalStatsUsers,
} from '../../hooks/useApi';

/**
 * 個人別数値(要望: シフトに代わる、人員ごとのシート。スプレッドシートの週次表を再現)。
 * 上: 月間サマリー(実績合計 / あるべき姿 / 達成率)、中: 月曜始まりの週ごとの表、下: 人員シートのタブ。
 * 日別セルは入力して 500ms 止まったら自動保存。手入力が無い日はシステム上の実績を薄く表示して集計にも使う。
 */

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
const SAVE_DELAY_MS = 500;
/** あるべき姿の初期値 = 週目標 × 5週(要望) */
const DEFAULT_WEEKS = 5;

type TargetField = 'weeklyStory' | 'monthlyGoal';

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** その月を月曜始まりの週に分ける。月の外の日は null(入力不可の空欄) */
function weeksOf(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const cur = new Date(first);
  cur.setDate(cur.getDate() - ((first.getDay() + 6) % 7));
  const weeks: (string | null)[][] = [];
  while (weeks.length === 0 || (cur.getMonth() === m - 1 && cur.getFullYear() === y)) {
    const week: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cur.getMonth() === m - 1 ? dateKey(cur) : null);
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

const rateOf = (actual: number, goal: number | null) => (goal && goal > 0 ? actual / goal : null);
const rateColor = (r: number | null) =>
  r == null ? 'var(--color-text-faint)' : r >= 1 ? 'var(--color-success)' : r < 0.7 ? 'var(--color-danger)' : 'var(--color-text)';
const fmtRate = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`);

/** 0以上の整数だけ受け付ける入力欄。空欄は「手入力なし」 */
function NumberCell({
  value,
  placeholder,
  onChange,
  disabled,
  title,
  width = '100%',
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  title?: string;
  width?: number | string;
}) {
  return (
    <input
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 6))}
      onFocus={(e) => e.target.select()}
      style={{
        width,
        height: 22,
        border: 'none',
        borderRadius: 0,
        background: 'transparent',
        boxShadow: 'none',
        padding: '0 2px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--color-text)',
      }}
    />
  );
}

export function PersonalStatsPage() {
  const [month] = usePeriodMonth();
  const { data: me } = useMe();
  const { data: users = [], isLoading: usersLoading } = usePersonalStatsUsers();
  const [params, setParams] = useSearchParams();
  const requested = params.get('user');
  const selectedId =
    (requested && users.some((u) => u.id === requested) ? requested : undefined) ??
    (me && users.some((u) => u.id === me.id) ? me.id : users[0]?.id);
  const selectUser = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('user', id);
    setParams(next, { replace: true });
  };

  const { data: sheet, isLoading } = usePersonalStats(selectedId, month);
  const queryClient = useQueryClient();
  const queryKey = ['personal-stats', 'sheet', selectedId, month];

  // 入力中の値(保存が終わるまでの表示用)。key = "日付|項目" / "t|項目|weeklyStory" など
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, number>>({});
  const chains = useRef<Record<string, Promise<void>>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  // シート・月を切り替えたら入力中の表示は捨てる(保存は走り切る)
  useEffect(() => setDrafts({}), [selectedId, month]);

  const clearDraft = (key: string, typed: string) =>
    setDrafts((d) => {
      if (d[key] !== typed) return d; // 保存中にさらに入力された
      const { [key]: _, ...rest } = d;
      return rest;
    });

  const onConflict = (e: unknown) => {
    alert(e instanceof ApiError ? e.message : '保存に失敗しました');
    queryClient.invalidateQueries({ queryKey: ['personal-stats'] });
  };

  /** 同じセルの保存は順番に(前の保存で増えた version を次の保存で使うため) */
  const enqueue = (key: string, run: () => Promise<void>) => {
    chains.current[key] = (chains.current[key] ?? Promise.resolve()).then(run).catch(() => undefined);
  };

  const scheduleSave = (key: string, run: () => Promise<void>) => {
    window.clearTimeout(timers.current[key]);
    timers.current[key] = window.setTimeout(() => enqueue(key, run), SAVE_DELAY_MS);
  };

  const setDaily = (date: string, metric: PersonalMetricKey, typed: string) => {
    const key = `${date}|${metric}`;
    setDrafts((d) => ({ ...d, [key]: typed }));
    const userId = selectedId!;
    const qk = queryKey;
    scheduleSave(key, async () => {
      const latest = draftsRef.current[key] ?? typed;
      const cached = queryClient.getQueryData<PersonalStatsSheet>(qk);
      const current = cached?.values[date]?.[metric];
      const value = latest === '' ? null : Number(latest);
      if ((current?.value ?? null) === value) return clearDraft(key, latest);
      try {
        const saved = await api.put<{ value: number; version: number } | null>('/personal-stats/daily', {
          userId,
          date,
          metricKey: metric,
          value,
          version: current?.version ?? null,
        });
        queryClient.setQueryData<PersonalStatsSheet>(qk, (old) => {
          if (!old) return old;
          const day = { ...(old.values[date] ?? {}) };
          if (saved) day[metric] = saved;
          else delete day[metric];
          return { ...old, values: { ...old.values, [date]: day } };
        });
        clearDraft(key, latest);
      } catch (e) {
        clearDraft(key, latest);
        onConflict(e);
      }
    });
  };

  const setTarget = (metric: PersonalMetricKey, field: TargetField, typed: string) => {
    const key = `t|${metric}|${field}`;
    setDrafts((d) => ({ ...d, [key]: typed }));
    const userId = selectedId!;
    const qk = queryKey;
    scheduleSave(key, async () => {
      const latest = draftsRef.current[key] ?? typed;
      const cached = queryClient.getQueryData<PersonalStatsSheet>(qk);
      const current = cached?.targets[metric];
      const value = latest === '' ? null : Number(latest);
      if ((current?.[field] ?? null) === value) return clearDraft(key, latest);
      try {
        const saved = await api.put<PersonalStatTarget>('/personal-stats/targets', {
          userId,
          month,
          metricKey: metric,
          [field]: value,
          version: current?.version ?? null,
        });
        queryClient.setQueryData<PersonalStatsSheet>(qk, (old) => (old ? { ...old, targets: { ...old.targets, [metric]: saved } } : old));
        clearDraft(key, latest);
      } catch (e) {
        clearDraft(key, latest);
        onConflict(e);
      }
    });
  };

  const weeks = useMemo(() => weeksOf(month), [month]);

  // ---- 値の取り出し(入力中 > 手入力 > システム実績) ----
  const manualOf = (date: string, m: PersonalMetricKey) => sheet?.values[date]?.[m]?.value;
  const autoOf = (date: string, m: PersonalMetricKey) => sheet?.auto[date]?.[m];
  const valueOf = (date: string | null, m: PersonalMetricKey): number => {
    if (!date) return 0;
    const d = drafts[`${date}|${m}`];
    if (d !== undefined) return d === '' ? autoOf(date, m) ?? 0 : Number(d);
    return manualOf(date, m) ?? autoOf(date, m) ?? 0;
  };
  const targetOf = (m: PersonalMetricKey, field: TargetField): number | null => {
    const d = drafts[`t|${m}|${field}`];
    if (d !== undefined) return d === '' ? null : Number(d);
    return sheet?.targets[m]?.[field] ?? null;
  };
  const targetText = (m: PersonalMetricKey, field: TargetField) => {
    const d = drafts[`t|${m}|${field}`];
    if (d !== undefined) return d;
    const v = sheet?.targets[m]?.[field];
    return v == null ? '' : String(v);
  };
  const weeklyOf = (m: PersonalMetricKey) => targetOf(m, 'weeklyStory');
  const goalOf = (m: PersonalMetricKey) => {
    const g = targetOf(m, 'monthlyGoal');
    if (g != null) return g;
    const w = weeklyOf(m);
    return w != null ? w * DEFAULT_WEEKS : null;
  };

  const metrics = sheet?.metrics ?? [];
  const canEditTargets = !!sheet?.canEditTargets;
  const monthTotal = (m: PersonalMetricKey) => (sheet?.days ?? []).reduce((a, d) => a + valueOf(d, m), 0);

  // ---- 表のスタイル ----
  const border = '1px solid var(--color-border)';
  const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: '2px 4px', borderRight: border, borderBottom: border, textAlign: 'center', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { borderRight: border, borderBottom: border, padding: 0, height: 24, textAlign: 'center', fontSize: 12 };
  const groupHead = (color: string, bg: string): React.CSSProperties => ({ ...th, background: bg, color });
  const blue = groupHead('var(--color-primary)', 'var(--color-primary-soft)');
  const green = groupHead('var(--color-success)', 'var(--color-success-soft)');
  const purple = groupHead('var(--color-accent)', 'var(--color-accent-soft)');
  const auto: React.CSSProperties = { ...td, background: 'var(--color-highlight-soft)', fontWeight: 600, minWidth: 44 };

  return (
    <AppLayout>
      <div className="page" style={{ paddingBottom: 0, display: 'flex', flexDirection: 'column', minHeight: 'calc(var(--viewport-height) - 48px)' }}>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="page-title">個人別数値</h1>
            <MonthSwitcher />
            {sheet && <span style={{ fontSize: 13, fontWeight: 700 }}>{sheet.user.name}</span>}
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
            薄い数字はシステム上の実績(入力すると上書き・空欄に戻すと実績に戻ります)
          </span>
        </div>

        <div style={{ flex: 1 }}>
          {usersLoading || (selectedId && isLoading) ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>
          ) : !selectedId ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>表示できる人員がいません(営業系の役職の有効なユーザーが対象です)</p>
          ) : sheet ? (
            <>
              {/* 月間サマリー */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }}>
                {metrics.map(({ key, label }) => {
                  const total = monthTotal(key);
                  const goal = goalOf(key);
                  const rate = rateOf(total, goal);
                  return (
                    <div key={key} style={{ background: 'var(--color-surface)', border, borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)' }}>
                        <span>{label}</span>
                        <span style={{ color: rateColor(rate) }}>{fmtRate(rate)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '2px 0 4px' }}>
                        <span style={{ fontSize: 20, fontWeight: 700 }}>{total}</span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>/</span>
                        {canEditTargets ? (
                          <span style={{ border, borderRadius: 4, display: 'inline-block' }} title="あるべき姿(月間目標)。空欄なら週目標×5週">
                            <NumberCell
                              width={52}
                              value={targetText(key, 'monthlyGoal')}
                              placeholder={goal != null ? String(goal) : '—'}
                              onChange={(v) => setTarget(key, 'monthlyGoal', v)}
                            />
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{goal ?? '—'}</span>
                        )}
                        <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>あるべき姿</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--color-sunken)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, (rate ?? 0) * 100)}%`, height: '100%', background: rateColor(rate) === 'var(--color-text)' ? 'var(--color-primary)' : rateColor(rate) }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 週ごとの表 */}
              {weeks.map((week, wi) => {
                const weekDays = week.filter((d): d is string => !!d);
                const throughWeek = weeks.slice(0, wi + 1).flat().filter((d): d is string => !!d);
                return (
                  <div key={wi} style={{ overflowX: 'auto', marginBottom: 10, border, borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
                    <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 760 }}>
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ ...th, textAlign: 'left', minWidth: 96, background: 'var(--color-subtle)', fontSize: 11 }}>
                            第{wi + 1}週
                          </th>
                          <th colSpan={9} style={blue}>実績</th>
                          <th colSpan={2} style={green}>ストーリー</th>
                          <th rowSpan={2} style={purple}>達成率</th>
                        </tr>
                        <tr>
                          {week.map((d, i) => (
                            <th key={i} style={{ ...th, minWidth: 40, background: i >= 5 ? 'var(--color-sunken)' : 'var(--color-subtle)', color: d ? undefined : 'var(--color-text-faint)' }}>
                              {d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8))}` : ''}
                              <span style={{ marginLeft: 2, fontWeight: 400, color: i >= 5 ? 'var(--color-danger)' : 'var(--color-text-faint)' }}>{WEEKDAYS[i]}</span>
                            </th>
                          ))}
                          <th style={blue}>週小計</th>
                          <th style={blue}>累計</th>
                          <th style={green}>週目標</th>
                          <th style={green}>当初合計</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.map(({ key, label }) => {
                          const sub = weekDays.reduce((a, d) => a + valueOf(d, key), 0);
                          const cum = throughWeek.reduce((a, d) => a + valueOf(d, key), 0);
                          const weekly = weeklyOf(key);
                          const planned = weekly != null ? weekly * (wi + 1) : null;
                          const rate = rateOf(cum, planned);
                          return (
                            <tr key={key}>
                              <td style={{ ...td, textAlign: 'left', padding: '0 6px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</td>
                              {week.map((d, i) => {
                                const bg = i >= 5 ? 'var(--color-sunken)' : undefined;
                                if (!d) return <td key={i} style={{ ...td, background: 'var(--color-subtle)' }} />;
                                const draft = drafts[`${d}|${key}`];
                                const manual = manualOf(d, key);
                                const autoV = autoOf(d, key);
                                return (
                                  <td key={i} style={{ ...td, background: bg }}>
                                    <NumberCell
                                      value={draft ?? (manual != null ? String(manual) : '')}
                                      placeholder={autoV ? String(autoV) : ''}
                                      title={autoV ? `システム上の実績: ${autoV}` : undefined}
                                      onChange={(v) => setDaily(d, key, v)}
                                    />
                                  </td>
                                );
                              })}
                              <td style={auto}>{sub}</td>
                              <td style={auto}>{cum}</td>
                              <td style={{ ...td, minWidth: 48 }}>
                                {canEditTargets ? (
                                  <NumberCell value={targetText(key, 'weeklyStory')} placeholder="—" onChange={(v) => setTarget(key, 'weeklyStory', v)} title="週目標(月内の全週で共通)" />
                                ) : (
                                  weekly ?? '—'
                                )}
                              </td>
                              <td style={{ ...td, minWidth: 52 }}>{planned ?? '—'}</td>
                              <td style={{ ...td, minWidth: 52, fontWeight: 700, color: rateColor(rate) }}>{fmtRate(rate)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </>
          ) : null}
        </div>

        {/* 人員シートのタブ(スプレッドシート風) */}
        {users.length > 0 && (
          <div
            style={{
              position: 'sticky',
              bottom: 0,
              display: 'flex',
              gap: 2,
              overflowX: 'auto',
              background: 'var(--color-subtle)',
              borderTop: '1px solid var(--color-border-strong)',
              padding: '0 4px',
              margin: '0 -16px',
              zIndex: 5,
            }}
          >
            {users.map((u) => {
              const active = u.id === selectedId;
              return (
                <button
                  key={u.id}
                  onClick={() => selectUser(u.id)}
                  style={{
                    flex: '0 0 auto',
                    height: 28,
                    padding: '0 12px',
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    border: 'none',
                    borderRadius: '0 0 6px 6px',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                    background: active ? 'var(--color-surface)' : 'transparent',
                    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                  }}
                >
                  {u.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
