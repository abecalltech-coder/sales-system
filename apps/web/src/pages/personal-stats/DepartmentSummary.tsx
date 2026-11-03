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
      style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: 0, fontSize: isPhone ? 14 : 12, fontWeight: 700, color: 'var(--color-primary)', cursor: 'pointer' }}
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

  const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: '3px 6px', borderRight: border, borderBottom: border, textAlign: 'center', whiteSpace: 'nowrap', background: 'var(--color-subtle)' };
  const td: React.CSSProperties = { fontSize: 12, padding: '3px 6px', borderRight: border, borderBottom: border, textAlign: 'center', whiteSpace: 'nowrap' };
  const tossTh: React.CSSProperties = { ...th, background: 'var(--color-primary-soft)', color: 'var(--color-primary)' };
  const appoTh: React.CSSProperties = { ...th, background: 'var(--color-appo-soft)', color: 'var(--color-appo)' };
  const purple: React.CSSProperties = { ...th, background: 'var(--color-accent-soft)', color: 'var(--color-accent)' };
  const total: React.CSSProperties = { ...td, background: 'var(--color-highlight-soft)', fontWeight: 700 };
  const tossTd = (v: React.ReactNode, extra?: React.CSSProperties) => <td style={{ ...td, background: 'var(--color-primary-soft)', ...extra }}>{v}</td>;
  const appoTd = (v: React.ReactNode, extra?: React.CSSProperties) => <td style={{ ...td, background: 'var(--color-appo-soft)', ...extra }}>{v}</td>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {charts}
    <div style={{ overflowX: 'auto', border, borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', width: 'fit-content', maxWidth: '100%' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            <th style={th}>名前</th>
            <th style={th}>役職</th>
            <th style={th}>稼働時間</th>
            <th style={th}>席数</th>
            <th style={th}>残日数</th>
            <th style={tossTh}>トス数</th>
            <th style={tossTh}>予算</th>
            <th style={tossTh}>残</th>
            <th style={tossTh}>平均/日</th>
            <th style={appoTh}>アポイント数</th>
            <th style={appoTh}>予算</th>
            <th style={appoTh}>残</th>
            <th style={appoTh}>平均/日</th>
            <th style={appoTh}>必要/日</th>
            <th style={purple}>進捗(アポ)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const [toss, appo] = r.stats;
            return (
              <tr key={r.user.id}>
                <td style={td}>{nameButton(r.user.id, r.user.name)}</td>
                <td style={{ ...td, textAlign: 'center' }}>{r.roleLabel && <RoleBadge label={r.roleLabel} />}</td>
                <td style={td}>{r.workMin > 0 ? fmtMinutes(r.workMin) : '—'}</td>
                <td style={td}>{fmtSeats(r.workMin, 2) || '—'}</td>
                <td style={td}>{r.restDays}日</td>
                {tossTd(<b style={{ color: 'var(--color-primary)' }}>{toss.actual}</b>)}
                {tossTd(toss.plan)}
                {tossTd(toss.rest, { color: restColor(toss.rest) })}
                {tossTd(avg(toss.avg))}
                {appoTd(<b style={{ color: 'var(--color-appo)' }}>{appo.actual}</b>)}
                {appoTd(appo.plan)}
                {appoTd(appo.rest, { color: restColor(appo.rest) })}
                {appoTd(avg(appo.avg))}
                {appoTd(avg(appo.perDay))}
                <td style={{ ...td, fontWeight: 700, color: rateColor(appo.progress) }}>{fmtRate(appo.progress)}</td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...total, textAlign: 'center' }} colSpan={2}>
              部署合計({rows.length}人)
            </td>
            <td style={total}>{totalMin > 0 ? fmtMinutes(totalMin) : '—'}</td>
            <td style={total}>{fmtSeats(totalMin, 2) || '—'}</td>
            <td style={total}>—</td>
            <td style={{ ...total, color: 'var(--color-primary)' }}>{totalStats[0].actual}</td>
            <td style={total}>{totalStats[0].plan}</td>
            <td style={{ ...total, color: restColor(totalStats[0].rest) }}>{totalStats[0].rest}</td>
            <td style={total}>{avg(totalStats[0].avg)}</td>
            <td style={{ ...total, color: 'var(--color-appo)' }}>{totalStats[1].actual}</td>
            <td style={total}>{totalStats[1].plan}</td>
            <td style={{ ...total, color: restColor(totalStats[1].rest) }}>{totalStats[1].rest}</td>
            <td style={total}>{avg(totalStats[1].avg)}</td>
            <td style={total}>—</td>
            <td style={{ ...total, color: rateColor(totalStats[1].progress) }}>{fmtRate(totalStats[1].progress)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    </div>
  );
}
