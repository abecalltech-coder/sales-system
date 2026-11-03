import { PersonalDailyKey, PersonalMetricKey, usePersonalStatsDepartment } from '../../hooks/useApi';
import { useIsPhone } from '../../lib/useIsPhone';
import { MemberBars } from './charts';
import { PLAN_METRICS, computeApSummary, fmtMinutes, fmtSeats, todayKeyJst } from './apStats';
import { RoleBadge, fmtRate, rateColor, rateOf } from './parts';

/**
 * 部署サマリー(要望): 部署の AP・APリーダーを1人1行(携帯は1人1枚)で並べ、各シートの累計と同じ数字を一覧にする。
 * 名前の右に役職。最後は部署合計。名前を押すとその人のシートを開く。トスは青、アポはオレンジ。
 */
export function DepartmentSummary({ departmentId, month, onOpen }: { departmentId: string; month: string; onOpen: (userId: string) => void }) {
  const isPhone = useIsPhone();
  const { data, isLoading } = usePersonalStatsDepartment(departmentId, month);
  if (isLoading || !data) return <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>;

  const today = todayKeyJst();
  const rows = data.members.map((m) => {
    const value = (d: string, key: PersonalDailyKey) => m.values[d]?.[key]?.value ?? m.auto[d]?.[key as PersonalMetricKey] ?? 0;
    const entered = (d: string, key: PersonalDailyKey) => m.values[d]?.[key] != null;
    return { user: m.user, roleLabel: m.roleLabel, ...computeApSummary(data.days, today, { value, entered }) };
  });

  // 部署合計(残件数・進捗は部署全体の予算と実績で出す)
  const totalMin = rows.reduce((a, r) => a + r.workMin, 0);
  const totalWorkedDays = rows.reduce((a, r) => a + r.workedDays, 0);
  const totalStats = [0, 1].map((i) => {
    const actual = rows.reduce((a, r) => a + r.stats[i].actual, 0);
    const plan = rows.reduce((a, r) => a + r.stats[i].plan, 0);
    const planToDate = rows.reduce((a, r) => a + r.stats[i].planToDate, 0);
    return {
      actual,
      plan,
      rest: Math.max(0, plan - actual),
      avg: totalWorkedDays > 0 ? actual / totalWorkedDays : null,
      progress: rateOf(actual, planToDate || null),
    };
  });

  const charts = (
    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0, 420px))', gap: 8 }}>
      {PLAN_METRICS.map((m, i) => (
        <MemberBars key={m.key} metric={m} onOpen={onOpen} rows={rows.map((r) => ({ id: r.user.id, name: r.user.name, actual: r.stats[i].actual, plan: r.stats[i].plan }))} />
      ))}
    </div>
  );

  const avg = (v: number | null) => (v == null ? '—' : v.toFixed(1));
  const restColor = (n: number) => (n > 0 ? 'var(--color-danger)' : 'var(--color-success)');
  const border = '1px solid var(--color-border)';
  const nameButton = (id: string, name: string) => (
    <button
      onClick={() => onOpen(id)}
      style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: 0, fontSize: isPhone ? 14 : 13, fontWeight: 700, color: 'var(--color-primary)', cursor: 'pointer' }}
    >
      {name}
    </button>
  );

  if (isPhone) {
    const totalCard = (i: 0 | 1) => {
      const toss = i === 0;
      const t = totalStats[i];
      return (
        <div
          style={{
            background: 'var(--color-surface)',
            border: `1px solid ${toss ? 'var(--color-primary-border)' : 'var(--color-appo-border)'}`,
            borderTop: `3px solid ${toss ? 'var(--color-primary)' : 'var(--color-appo)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '6px 8px',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: toss ? 'var(--color-primary)' : 'var(--color-appo)' }}>部署{toss ? 'トス' : 'アポ'}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{t.actual}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>/ 予算 {t.plan}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            残 <b style={{ color: restColor(t.rest) }}>{t.rest}件</b>
            {!toss && (
              <>
                {' '}・ 進捗 <b style={{ color: rateColor(t.progress) }}>{fmtRate(t.progress)}</b>
              </>
            )}
          </div>
        </div>
      );
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          {totalCard(0)}
          {totalCard(1)}
        </div>
        {charts}
        {rows.map((r) => {
          const [toss, appo] = r.stats;
          return (
            <div key={r.user.id} style={{ background: 'var(--color-surface)', border, borderRadius: 'var(--radius-md)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {nameButton(r.user.id, r.user.name)}
                  {r.roleLabel && <RoleBadge label={r.roleLabel} />}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: rateColor(appo.progress) }}>進捗 {fmtRate(appo.progress)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, fontSize: 11, color: 'var(--color-text-muted)' }}>
                <span>稼働 <b style={{ color: 'var(--color-text)' }}>{r.workMin > 0 ? fmtMinutes(r.workMin) : '—'}</b></span>
                <span>席数 <b style={{ color: 'var(--color-text)' }}>{fmtSeats(r.workMin, 2) || '—'}</b></span>
                <span>残日数 <b style={{ color: 'var(--color-text)' }}>{r.restDays}日</b></span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, fontSize: 12 }}>
                <div style={{ background: 'var(--color-primary-soft)', borderRadius: 6, padding: '4px 6px' }}>
                  <b style={{ color: 'var(--color-primary)' }}>トス</b> <b>{toss.actual}</b>
                  <span style={{ color: 'var(--color-text-muted)' }}>/{toss.plan}</span>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>残{toss.rest} ・ 平均{avg(toss.avg)}/日</div>
                </div>
                <div style={{ background: 'var(--color-appo-soft)', borderRadius: 6, padding: '4px 6px' }}>
                  <b style={{ color: 'var(--color-appo)' }}>アポ</b> <b>{appo.actual}</b>
                  <span style={{ color: 'var(--color-text-muted)' }}>/{appo.plan}</span>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                    残{appo.rest}
                    {appo.perDay != null && ` ・ 1日${avg(appo.perDay)}必要`}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // PC(要望: 詰めすぎで見づらい): 上に部署合計のカード、下の表は余白を広めにして
  // 見出しを「トス / アポ」の2段に。実績と予算は「実績 / 予算」の1マスにまとめて棒で達成度を見せる
  const th: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: '6px 14px', borderBottom: border, textAlign: 'center', whiteSpace: 'nowrap', background: 'var(--color-subtle)', color: 'var(--color-text-muted)' };
  const td: React.CSSProperties = { fontSize: 13, padding: '8px 14px', borderBottom: '1px solid var(--color-sunken)', textAlign: 'center', whiteSpace: 'nowrap' };
  const sep: React.CSSProperties = { borderLeft: border };
  const groupTh = (label: string, color: string, bg: string, span: number) => (
    <th colSpan={span} style={{ ...th, ...sep, fontSize: 12, fontWeight: 800, color, background: bg }}>
      {label}
    </th>
  );
  const total: React.CSSProperties = { ...td, background: 'var(--color-highlight-faint)', fontWeight: 700, borderTop: border, borderBottom: 'none' };

  /** 実績 / 予算 と達成度の棒 */
  const actualCell = (actual: number, plan: number, color: string, style: React.CSSProperties) => {
    const ratio = plan > 0 ? Math.min(1, actual / plan) : 0;
    return (
      <td style={{ ...style, ...sep, minWidth: 110 }}>
        <div>
          <b style={{ fontSize: 15, color }}>{actual}</b>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}> / {plan}</span>
        </div>
        <div style={{ height: 4, background: 'var(--color-sunken)', borderRadius: 2, marginTop: 3 }}>
          <div style={{ width: `${ratio * 100}%`, height: 4, background: color, borderRadius: 2 }} />
        </div>
      </td>
    );
  };
  const progressPill = (v: number | null) => (
    <span style={{ display: 'inline-block', minWidth: 56, padding: '2px 8px', borderRadius: 999, fontWeight: 800, color: rateColor(v), border: `1px solid ${rateColor(v)}` }}>
      {fmtRate(v)}
    </span>
  );

  const kpi = (label: string, value: React.ReactNode, sub?: React.ReactNode, color?: string) => (
    <div style={{ background: 'var(--color-surface)', border, borderTop: color ? `3px solid ${color}` : border, borderRadius: 'var(--radius-md)', padding: '10px 16px', textAlign: 'center', minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: color ?? 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const [tT, aT] = totalStats;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {kpi('人数', `${rows.length}人`, `稼働 ${totalMin > 0 ? fmtMinutes(totalMin) : '—'} ・ 席数 ${fmtSeats(totalMin, 2) || '—'}`)}
        {kpi(
          '部署トス',
          <>
            <span style={{ color: 'var(--color-primary)' }}>{tT.actual}</span>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}> / {tT.plan}</span>
          </>,
          <>
            残 <b style={{ color: restColor(tT.rest) }}>{tT.rest}件</b> ・ 平均 {avg(tT.avg)}/日
          </>,
          'var(--color-primary)',
        )}
        {kpi(
          '部署アポ',
          <>
            <span style={{ color: 'var(--color-appo)' }}>{aT.actual}</span>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}> / {aT.plan}</span>
          </>,
          <>
            残 <b style={{ color: restColor(aT.rest) }}>{aT.rest}件</b> ・ 平均 {avg(aT.avg)}/日
          </>,
          'var(--color-appo)',
        )}
        {kpi('進捗(アポ)', <span style={{ color: rateColor(aT.progress) }}>{fmtRate(aT.progress)}</span>, '今日までの予算に対して', 'var(--color-accent)')}
      </div>

      {charts}

      <div style={{ overflowX: 'auto', border, borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', width: 'fit-content', maxWidth: '100%' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th colSpan={4} style={th} />
              {groupTh('トス', 'var(--color-primary)', 'var(--color-primary-soft)', 3)}
              {groupTh('アポ', 'var(--color-appo)', 'var(--color-appo-soft)', 4)}
              <th style={{ ...th, ...sep }} />
            </tr>
            <tr>
              <th style={th}>名前</th>
              <th style={th}>稼働時間</th>
              <th style={th}>席数</th>
              <th style={th}>残日数</th>
              <th style={{ ...th, ...sep }}>実績 / 予算</th>
              <th style={th}>残</th>
              <th style={th}>平均/日</th>
              <th style={{ ...th, ...sep }}>実績 / 予算</th>
              <th style={th}>残</th>
              <th style={th}>平均/日</th>
              <th style={th}>必要/日</th>
              <th style={{ ...th, ...sep }}>進捗(アポ)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const [toss, appo] = r.stats;
              return (
                <tr key={r.user.id}>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {nameButton(r.user.id, r.user.name)}
                      {r.roleLabel && <RoleBadge label={r.roleLabel} />}
                    </span>
                  </td>
                  <td style={td}>{r.workMin > 0 ? fmtMinutes(r.workMin) : '—'}</td>
                  <td style={td}>{fmtSeats(r.workMin, 2) || '—'}</td>
                  <td style={td}>{r.restDays}日</td>
                  {actualCell(toss.actual, toss.plan, 'var(--color-primary)', td)}
                  <td style={{ ...td, fontWeight: 700, color: restColor(toss.rest) }}>{toss.rest}</td>
                  <td style={td}>{avg(toss.avg)}</td>
                  {actualCell(appo.actual, appo.plan, 'var(--color-appo)', td)}
                  <td style={{ ...td, fontWeight: 700, color: restColor(appo.rest) }}>{appo.rest}</td>
                  <td style={td}>{avg(appo.avg)}</td>
                  <td style={td}>{avg(appo.perDay)}</td>
                  <td style={{ ...td, ...sep }}>{progressPill(appo.progress)}</td>
                </tr>
              );
            })}
            <tr>
              <td style={total}>部署合計({rows.length}人)</td>
              <td style={total}>{totalMin > 0 ? fmtMinutes(totalMin) : '—'}</td>
              <td style={total}>{fmtSeats(totalMin, 2) || '—'}</td>
              <td style={total}>—</td>
              {actualCell(tT.actual, tT.plan, 'var(--color-primary)', total)}
              <td style={{ ...total, color: restColor(tT.rest) }}>{tT.rest}</td>
              <td style={total}>{avg(tT.avg)}</td>
              {actualCell(aT.actual, aT.plan, 'var(--color-appo)', total)}
              <td style={{ ...total, color: restColor(aT.rest) }}>{aT.rest}</td>
              <td style={total}>{avg(aT.avg)}</td>
              <td style={total}>—</td>
              <td style={{ ...total, ...sep }}>{progressPill(aT.progress)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
