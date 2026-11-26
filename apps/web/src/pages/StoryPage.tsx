import { useState } from 'react';
import { useDepartments } from '../hooks/useApi';
import { todayKeyJst } from './personal-stats/apStats';
import { StoryTable } from './SummaryStory';

/**
 * ストーリー(数値管理): 直販ALL → CH東 → CH西 → CT東 の順に週表を並べる。
 * 直販ALLは3部署の数字を足した表示専用。各部署の表は手打ちで入力する。
 */
const ORDER = ['CH東', 'CH西', 'CT東'];

export function StoryPage() {
  const { data: departments } = useDepartments();
  const [month, setMonth] = useState(todayKeyJst().slice(0, 7));
  const list = ORDER.map((name) => departments?.find((d) => d.name === name)).filter((d): d is NonNullable<typeof d> => !!d);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 18 }}>ストーリー</h1>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ fontSize: 13 }} />
        <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
          数字はすべて手打ち(前日までが実績・今日以降は予定)。日付を押すと灰色(休み)に切り替え。あるべき姿は一番下の枠に月の目標を入れる
        </span>
      </div>
      {list.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>部署(CH東・CH西・CT東)が見つかりません</p>}
      {list.length > 0 && (
        <section>
          <h2 style={{ fontSize: 14, marginBottom: 6 }}>【直販ALL ストーリー】<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-faint)' }}> {list.map((d) => d.name).join('+')} の合計(入力はできません)</span></h2>
          <StoryTable departmentIds={list.map((d) => d.id)} month={month} />
        </section>
      )}
      {list.map((d) => (
        <section key={d.id}>
          <h2 style={{ fontSize: 14, marginBottom: 6 }}>【{d.name} ストーリー】</h2>
          <StoryTable departmentIds={[d.id]} month={month} />
        </section>
      ))}
    </div>
  );
}
