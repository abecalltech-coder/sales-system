import { useRef, useState } from 'react';
import { recognizeBill, extractBillFields, BillField } from '../lib/ocr';
import { logCopy } from '../lib/copyLog';

const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': '読み取りエンジンを準備しています',
  'initializing tesseract': '読み取りエンジンを準備しています',
  'loading language traineddata': '日本語データを読み込んでいます(初回のみ)',
  'initializing api': '読み取りエンジンを準備しています',
  'recognizing text': '文字を読み取っています',
};

/**
 * 明細読み取り(要望: 電気明細を写真で撮ってテキスト化。完全無料)。
 * 端末の中だけで読み取るので、写真や内容は外部・サーバーへ送られない。
 */
export function BillReader({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  // カメラ専用(capture付き)だと携帯で写真フォルダから選べないため、撮影用と選択用を分ける
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [fields, setFields] = useState<BillField[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ p: number; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1500);
  };

  const run = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setText('');
    setFields([]);
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
    try {
      const result = await recognizeBill(file, (p, status) => setProgress({ p, status }));
      setText(result);
      setFields(extractBillFields(result));
      if (!result) setError('文字を読み取れませんでした。明るい場所で、明細全体がまっすぐ写るように撮り直してください。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み取りに失敗しました');
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      logCopy(`明細読み取り(${label})`, value);
      flash('コピーしました');
    } catch {
      flash('コピーできませんでした');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, width: '100%', padding: 14, maxHeight: '92vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, flex: 1 }}>明細読み取り</h2>
          <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
            閉じる
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          電気明細の写真を撮る(または選ぶ)と、文字をテキストにします。読み取りはこの端末の中だけで行い、写真は外部に送られません(無料)。
          明るい場所で、明細全体がまっすぐ・大きく写るように撮ると精度が上がります。
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => cameraRef.current?.click()} style={{ fontSize: 13, padding: '7px 14px' }}>
            {busy ? '読み取り中...' : 'カメラで撮る'}
          </button>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} style={{ fontSize: 13, padding: '7px 14px' }}>
            写真フォルダから選ぶ
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void run(e.target.files?.[0])} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void run(e.target.files?.[0])} />
        </div>

        {progress && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
              {STATUS_LABELS[progress.status] ?? progress.status} {progress.status === 'recognizing text' ? `${Math.round(progress.p * 100)}%` : ''}
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--color-sunken)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(progress.p * 100)}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.2s' }} />
            </div>
          </div>
        )}
        {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fields.length > 0 && (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px' }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>見つかった項目(候補。必ず写真と見比べてください)</div>
              {fields.map((f) => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--color-sunken)' }}>
                  <span style={{ width: 120, flexShrink: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>{f.label}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, wordBreak: 'break-all' }}>{f.value}</span>
                  <button type="button" onClick={() => void copy(f.value, f.label)} style={{ fontSize: 11, padding: '2px 8px' }}>
                    コピー
                  </button>
                </div>
              ))}
            </div>
          )}

          {(text || busy) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12 }}>読み取ったテキスト(直接直せます)</span>
                <button type="button" disabled={!text} onClick={() => void copy(text, '全文')} style={{ fontSize: 11, padding: '2px 8px' }}>
                  全文をコピー
                </button>
              </div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, lineHeight: 1.6 }} />
            </div>
          )}

          {preview && (
            <details>
              <summary style={{ fontSize: 12, cursor: 'pointer' }}>読み取った写真を見る</summary>
              <img src={preview} alt="読み取った明細" style={{ maxWidth: '100%', marginTop: 6, borderRadius: 6 }} />
            </details>
          )}
        </div>
        {toast && <div className="chat-toast">{toast}</div>}
      </div>
    </div>
  );
}
