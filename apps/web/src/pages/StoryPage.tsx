import { AppLayout } from '../components/AppLayout';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { useDepartments } from '../hooks/useApi';
import { usePeriodMonth } from '../lib/usePeriodMonth';
import { STORY_COLORS, StoryTable } from './SummaryStory';

/**
 * ストーリー(数値管理): 直販ALL → CH東 → CH西 → CT東 の順に、月間の合計表と週表を並べる。
 * 直販ALLは3部署の数字を足した表示専用。各部署の表は手打ちで入力する。部署ごとに色を変える。
 */
const ORDER = ['CH東', 'CH西', 'CT東'];

export function StoryPage() {
  const { data: departments } = useDepartments();
  const [month] = usePeriodMonth();
  const list = ORDER.map((name) => departments?.find((d) => d.name === name)).filter((d): d is NonNullable<typeof d> => !!d);

  const heading = (name: string, note?: string) => (
    <h2 style={{ fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ background: STORY_COLORS[name].mid, padding: '2px 10px', borderRadius: 6 }}>【{name} ストーリー】</span>
      {note && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-faint)' }}>{note}</span>}
    </h2>
  );

  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 'none' }}>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="page-title">ストーリー</h1>
            <MonthSwitcher />
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-faint)', margin: '0 0 10px' }}>
          数字はすべて手打ち(前日までが実績・今日以降は予定)。日付を押すと灰色(休み)に切り替え。月目標は各表の一番下の「あるべき姿」の枠に入れます
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {list.length === 0 && <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>部署(CH東・CH西・CT東)が見つかりません</p>}
          {list.length > 0 && (
            <section>
              {heading('直販ALL', `${list.map((d) => d.name).join('+')} の合計(入力はできません)`)}
              <StoryTable departmentIds={list.map((d) => d.id)} month={month} color={STORY_COLORS['直販ALL']} />
            </section>
          )}
          {list.map((d) => (
            <section key={d.id}>
              {heading(d.name)}
              <StoryTable departmentIds={[d.id]} month={month} color={STORY_COLORS[d.name]} />
            </section>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
