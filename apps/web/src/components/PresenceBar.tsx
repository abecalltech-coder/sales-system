import { CSSProperties } from 'react';
import { PresenceViewer, colorForUser } from '../lib/usePresence';
import { useUserOptions } from '../hooks/useApi';
import { Avatar } from './Avatar';

/**
 * 同じタブ(画面)を開いている人を名前で表示する共通バー(要望)。閲覧者がいない場合は何も表示しない。
 * 色はアカウントのアイコンと同じで、相手が選択しているセルもこの色で表示される。
 * 同じ人が複数のウィンドウで開いていても1人として出す。
 */
export function PresenceBar({ viewers, style }: { viewers: PresenceViewer[]; style?: CSSProperties }) {
  const { data: userOptions } = useUserOptions();
  const unique = [...new Map(viewers.map((v) => [v.userId, v])).values()];
  if (unique.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: 'var(--color-text-muted)', ...style }}>
      <span>このタブを開いている人:</span>
      {unique.map((v) => {
        const color = colorForUser(v.userId);
        return (
          <span
            key={v.userId}
            title={`${v.userName}さんがこのタブを開いています(選択中のセルはこの色で表示)`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '1px 8px 1px 2px',
              borderRadius: 999,
              background: `${color}1a`,
              border: `1px solid ${color}`,
              color,
              fontWeight: 700,
            }}
          >
            <Avatar src={userOptions?.find((u) => u.id === v.userId)?.iconUrl} name={v.userName} seed={v.userId} size={18} />
            {v.userName}
          </span>
        );
      })}
    </div>
  );
}
