import { PersonalDailyKey, PersonalMetricKey, usePersonalStatsDepartment } from '../../hooks/useApi';
import { computeApSummary, fmtMinutes, fmtSeats, todayKeyJst } from './apStats';
import { fmtRate, rateColor, rateOf } from './parts';

/**
 * 部署サマリー(要望): 部署の AP・APリーダーを1人1行で並べ、各シート上部の累計と同じ数字を一覧にする。
 * 最後の行は部署合計。名前を押すとその人のシートを開く。
 */
export function DepartmentSummary({ departmentId, month, onOpen }: { departmentId: string; month: string; onOpen: (userId: string) => void }) {
  const { data, isLoading } = usePersonalStatsDepartment(departmentId, month);
  if (isLoading || !data) return <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>;

  const today = todayKeyJst();
  const rows = data.members.map((m) => {
    const value = (d: string, key: PersonalDailyKey) => m.values[d]?.[key]?.value ?? m.auto[d]?.[key as PersonalMetricKey] ?? 0;
    const entered = (d: string, key: PersonalDailyKey) => m.values[d]?.[key] != null;
    return { user: m.user, ...computeApSummary(data.days, today, { value, entered }) };
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

  const border = '1px solid var(--color-border)';
  const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: '3px 6px', borderRight: border, borderBottom: border, textAlign: 'center', whiteSpace: 'nowrap', background: 'var(--color-subtle)' };
  const td: React.CSSProperties = { fontSize: 12, padding: '3px 6px', borderRight: border, borderBottom: border, textAlign: 'right', whiteSpace: 'nowrap' };
  const blue: React.CSSProperties = { ...th, background: 'var(--color-primary-soft)', color: 'var(--color-primary)' };
  const green: React.CSSProperties = { ...th, background: 'var(--color-success-soft)', color: 'var(--color-success)' };
  const purple: React.CSSProperties = { ...th, background: 'var(--color-accent-soft)', color: 'var(--color-accent)' };
  const total: React.CSSProperties = { ...td, background: 'var(--color-highlight-soft)', fontWeight: 700 };
  const avg = (v: number | null) => (v == null ? '—' : v.toFixed(1));
  const restColor = (n: number) => (n > 0 ? 'var(--color-danger)' : 'var(--color-success)');

  return (
    <div style={{ overflowX: 'auto', border, borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>名前</th>
            <th style={th}>稼働時間</th>
            <th style={th}>席数</th>
            <th style={blue}>トス数</th>
            <th style={green}>トス予算</th>
            <th style={th}>残トス</th>
            <th style={blue}>アポイント数</th>
            <th style={green}>アポ予算</th>
            <th style={th}>残アポ</th>
            <th style={th}>平均 トス/日</th>
            <th style={th}>平均 アポ/日</th>
            <th style={th}>残日数</th>
            <th style={th}>必要アポ/日</th>
            <th style={purple}>進捗(アポ)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const [toss, appo] = r.stats;
            return (
              <tr key={r.user.id}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                  <button
                    onClick={() => onOpen(r.user.id)}
                    style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: 0, fontSize: 12, fontWeight: 600, color: 'var(--color-primary)', cursor: 'pointer' }}
                  >
                    {r.user.name}
                  </button>
                </td>
                <td style={td}>{r.workMin > 0 ? fmtMinutes(r.workMin) : '—'}</td>
                <td style={td}>{fmtSeats(r.workMin, 2) || '—'}</td>
                <td style={td}>{toss.actual}</td>
                <td style={td}>{toss.plan}</td>
                <td style={{ ...td, color: restColor(toss.rest) }}>{toss.rest}</td>
                <td style={td}>{appo.actual}</td>
                <td style={td}>{appo.plan}</td>
                <td style={{ ...td, color: restColor(appo.rest) }}>{appo.rest}</td>
                <td style={td}>{avg(toss.avg)}</td>
                <td style={td}>{avg(appo.avg)}</td>
                <td style={td}>{r.restDays}日</td>
                <td style={td}>{avg(appo.perDay)}</td>
                <td style={{ ...td, fontWeight: 700, color: rateColor(appo.progress) }}>{fmtRate(appo.progress)}</td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...total, textAlign: 'left' }}>部署合計({rows.length}人)</td>
            <td style={total}>{totalMin > 0 ? fmtMinutes(totalMin) : '—'}</td>
            <td style={total}>{fmtSeats(totalMin, 2) || '—'}</td>
            <td style={total}>{totalStats[0].actual}</td>
            <td style={total}>{totalStats[0].plan}</td>
            <td style={{ ...total, color: restColor(totalStats[0].rest) }}>{totalStats[0].rest}</td>
            <td style={total}>{totalStats[1].actual}</td>
            <td style={total}>{totalStats[1].plan}</td>
            <td style={{ ...total, color: restColor(totalStats[1].rest) }}>{totalStats[1].rest}</td>
            <td style={total}>{avg(totalStats[0].avg)}</td>
            <td style={total}>{avg(totalStats[1].avg)}</td>
            <td style={total}>—</td>
            <td style={total}>—</td>
            <td style={{ ...total, color: rateColor(totalStats[1].progress) }}>{fmtRate(totalStats[1].progress)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
