import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { AppointerSheet } from './AppointerSheet';
import { DepartmentSummary } from './DepartmentSummary';
import { RoleBadge } from './parts';
import { MonthSwitcher } from '../../components/MonthSwitcher';
import { usePeriodMonth } from '../../lib/usePeriodMonth';
import { api, ApiError } from '../../lib/api';
import { PersonalDailyKey, PersonalMetricKey, PersonalStatsSheet, useMe, usePersonalStats, usePersonalStatsUsers } from '../../hooks/useApi';

/**
 * 個人別数値(要望: シフトに代わる、人員ごとのシート。対象は AP・APリーダー)。
 * 部署を選ぶと、下のタブに「部署サマリー」とその部署の人員シートが並ぶ。
 * 日別セルは入力して 500ms 止まったら自動保存。手入力が無い日はシステム上の実績を薄く表示して集計にも使う。
 */

const SAVE_DELAY_MS = 500;
/** 下のタブで部署サマリーを選んでいるときの値 */
const SUMMARY_TAB = 'summary';

export function PersonalStatsPage() {
  const [month] = usePeriodMonth();
  const { data: me } = useMe();
  const { data: users = [], isLoading: usersLoading } = usePersonalStatsUsers();
  const [params, setParams] = useSearchParams();
  const requested = params.get('user');

  // 部署ごとに切り替えて見る(要望)。下のタブはその部署の人だけにする
  const deptKey = (u: { departmentId: string | null }) => u.departmentId ?? 'none';
  const departments = useMemo(() => {
    const seen = new Map<string, string>();
    for (const u of users) if (!seen.has(deptKey(u))) seen.set(deptKey(u), u.departmentName ?? '部署なし');
    return [...seen].map(([key, name]) => ({ key, name }));
  }, [users]);
  const requestedDept = params.get('dept');
  const userDept = (id: string | null | undefined) => {
    const u = users.find((x) => x.id === id);
    return u ? deptKey(u) : undefined;
  };
  const selectedDept =
    (requestedDept && departments.some((d) => d.key === requestedDept) ? requestedDept : undefined) ??
    userDept(requested) ??
    userDept(me?.id) ??
    departments[0]?.key;
  const deptUsers = users.filter((u) => deptKey(u) === selectedDept);
  const showSummary = requested === SUMMARY_TAB && deptUsers.length > 0;
  const selectedId = showSummary
    ? undefined
    : (requested && deptUsers.some((u) => u.id === requested) ? requested : undefined) ??
      (me && deptUsers.some((u) => u.id === me.id) ? me.id : deptUsers[0]?.id);
  const selectUser = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('user', id);
    if (selectedDept) next.set('dept', selectedDept);
    setParams(next, { replace: true });
  };
  const selectDept = (key: string) => {
    const next = new URLSearchParams(params);
    next.set('dept', key);
    if (next.get('user') !== SUMMARY_TAB) next.delete('user');
    setParams(next, { replace: true });
  };

  const { data: sheet, isLoading } = usePersonalStats(selectedId, month);
  const queryClient = useQueryClient();
  const queryKey = ['personal-stats', 'sheet', selectedId, month];

  // 入力中の値(保存が終わるまでの表示用)。key = "日付|項目"
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

  const setDaily = (date: string, metric: PersonalDailyKey, typed: string) => {
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

  // ---- 値の取り出し(入力中 > 手入力 > システム実績) ----
  const manualOf = (date: string, m: PersonalDailyKey) => sheet?.values[date]?.[m]?.value;
  const autoOf = (date: string, m: PersonalDailyKey) => sheet?.auto[date]?.[m as PersonalMetricKey];
  const valueOf = (date: string | null, m: PersonalDailyKey): number => {
    if (!date) return 0;
    const d = drafts[`${date}|${m}`];
    if (d !== undefined) return d === '' ? autoOf(date, m) ?? 0 : Number(d);
    return manualOf(date, m) ?? autoOf(date, m) ?? 0;
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
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
  });

  return (
    <AppLayout>
      <div className="page" style={{ paddingBottom: 0, display: 'flex', flexDirection: 'column', minHeight: 'calc(var(--viewport-height) - 48px)' }}>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="page-title">個人別数値</h1>
            <MonthSwitcher />
            {departments.length > 1 && (
              <select
                value={selectedDept}
                onChange={(e) => selectDept(e.target.value)}
                aria-label="部署"
                style={{ height: 26, fontSize: 12, padding: '0 6px' }}
              >
                {departments.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            {!showSummary && sheet && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{sheet.user.name}</span>
                {sheet.roleLabel && <RoleBadge label={sheet.roleLabel} />}
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
            薄い数字はシステム上の実績(入力すると上書き・空欄に戻すと実績に戻ります)
          </span>
        </div>

        <div style={{ flex: 1 }}>
          {usersLoading || (selectedId && isLoading) ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>
          ) : deptUsers.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>表示できる人員がいません(AP・APリーダーの有効なユーザーが対象です)</p>
          ) : showSummary && selectedDept ? (
            <DepartmentSummary departmentId={selectedDept} month={month} onOpen={selectUser} />
          ) : sheet ? (
            <AppointerSheet sheet={sheet} drafts={drafts} valueOf={valueOf} manualOf={manualOf} autoOf={autoOf} setDaily={setDaily} />
          ) : null}
        </div>

        {/* 部署サマリーと人員シートのタブ(スプレッドシート風) */}
        {deptUsers.length > 0 && (
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
            <button onClick={() => selectUser(SUMMARY_TAB)} style={tabStyle(showSummary)}>
              部署サマリー
            </button>
            {deptUsers.map((u) => (
              <button key={u.id} onClick={() => selectUser(u.id)} style={tabStyle(u.id === selectedId)}>
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
