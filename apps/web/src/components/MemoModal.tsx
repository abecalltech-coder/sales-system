import { useEffect, useState } from 'react';

/**
 * 備考(アポ詳細など長文)の全文表示モーダル。
 * 一覧セルは省略表示のため、クリックで全文を大きく確認でき、その場で編集・保存もできる。
 */
export function MemoModal({
  title = '備考(アポ詳細)',
  value,
  onSave,
  onClose,
  readOnly,
}: {
  title?: string;
  value: string;
  onSave?: (next: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (onSave && draft !== value) onSave(draft);
    setEditing(false);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2500,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: 520, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ fontSize: 15 }}>{title}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {!readOnly && onSave && !editing && (
              <button onClick={() => setEditing(true)}>編集</button>
            )}
            <button onClick={onClose}>閉じる</button>
          </div>
        </div>

        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ flex: 1, minHeight: 320, width: '100%', lineHeight: 1.6, whiteSpace: 'pre-wrap', resize: 'vertical' }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 13,
              lineHeight: 1.7,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '10px 12px',
              minHeight: 120,
            }}
          >
            {value || <span style={{ color: 'var(--color-text-faint)' }}>(未入力)</span>}
          </div>
        )}

        {editing && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
            >
              キャンセル
            </button>
            <button className="btn-primary" onClick={commit}>
              保存
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
