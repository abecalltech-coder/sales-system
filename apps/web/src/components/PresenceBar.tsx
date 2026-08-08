import { PresenceViewer, colorForUser } from '../lib/usePresence';

/** 「〇〇さんが閲覧中」を表示する共通バー。閲覧者がいない場合は何も表示しない。 */
export function PresenceBar({ viewers }: { viewers: PresenceViewer[] }) {
  if (viewers.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>
      <span>閲覧中:</span>
      {viewers.map((v) => (
        <span
          key={v.socketId}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 999,
            background: `${colorForUser(v.userId)}1a`,
            color: colorForUser(v.userId),
            fontWeight: 600,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: colorForUser(v.userId) }} />
          {v.userName}
        </span>
      ))}
    </div>
  );
}
