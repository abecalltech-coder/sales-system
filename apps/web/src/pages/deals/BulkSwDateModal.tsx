import { useState } from 'react';
import { DealFieldItem, DealListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { parseDateText } from '../../lib/dateInput';
import { parseTsv } from '../../lib/tsv';

/** 申込番号の照合用: 全角/半角・空白・英字の大小の違いを無視する */
const appNoKeyOf = (v: unknown) => (typeof v === 'string' ? v.normalize('NFKC').replace(/\s/g, '').toUpperCase() : '');

/**
 * SW日の反映(要望): 外部シート(申込番号・SW日の列がある表)を貼り付けると、
 * 申込番号が一致する案件の SW日 に反映する。案件は新規作成しない。
 * 手打ちで入れた SW日 は上書きしない(一括投入と同じ決まり。空欄か前回の一括投入の値だけ入れる)。
 */
export function BulkSwDateModal({
  fields,
  onClose,
  onImported,
}: {
  fields: DealFieldItem[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    rowsRead: number;
    matched: number;
    updated: number;
    protectedFields: number;
    noDate: number;
    notFound: string[];
  } | null>(null);

  const submit = async () => {
    setError(null);
    setSummary(null);
    const table = parseTsv(text);
    if (table.length < 2) {
      setError('見出し行を含む表を貼り付けてください(1行目が項目名、2行目以降がデータ)');
      return;
    }
    const header = table[0].map((h) => h.trim());
    const noIdx = header.indexOf('申込番号');
    const swIdx = header.indexOf('SW日');
    if (noIdx < 0 || swIdx < 0) {
      setError('見出し行に「申込番号」と「SW日」の列が必要です');
      return;
    }
    const appNoField = fields.find((f) => f.fieldKey === 'application_number') ?? fields.find((f) => f.label === '申込番号');
    const swField = fields.find((f) => f.fieldKey === 'sw_date') ?? fields.find((f) => f.label === 'SW日');
    if (!appNoField || !swField) {
      setError('案件管理に「申込番号」「SW日」の列がありません');
      return;
    }

    // 申込番号 → SW日(同じ申込番号が複数行なら、日付がある行のうち後の行を使う)
    const swByNo = new Map<string, { raw: string; iso: string }>();
    let rowsRead = 0;
    let noDate = 0;
    for (const line of table.slice(1)) {
      const no = appNoKeyOf(line[noIdx] ?? '');
      if (!no) continue;
      rowsRead += 1;
      const p = parseDateText((line[swIdx] ?? '').trim());
      if (!p) {
        noDate += 1;
        continue;
      }
      swByNo.set(no, { raw: (line[noIdx] ?? '').trim(), iso: new Date(`${p}T00:00:00`).toISOString() });
    }
    if (swByNo.size === 0) {
      setError('SW日が入っている行がありませんでした');
      return;
    }

    setSubmitting(true);
    try {
      const existing = await api.get<{ items: DealListItem[] }>('/deals?page=1&pageSize=5000');
      const updates: { id: string; values: Record<string, unknown> }[] = [];
      const found = new Set<string>();
      for (const d of existing.items) {
        const no = appNoKeyOf(d.values[appNoField.fieldKey]);
        const hit = no ? swByNo.get(no) : undefined;
        if (!hit) continue;
        found.add(no);
        updates.push({ id: d.id, values: { [swField.fieldKey]: hit.iso } });
      }
      const notFound = [...swByNo.entries()].filter(([k]) => !found.has(k)).map(([, v]) => v.raw);
      if (updates.length === 0) {
        setError('申込番号が一致する案件がありませんでした');
        return;
      }
      const res = await api.post<{ updated: number; protectedFields: number }>('/deals/bulk-create', { rows: [], updates });
      setSummary({ rowsRead, matched: updates.length, updated: res.updated ?? 0, protectedFields: res.protectedFields ?? 0, noDate, notFound });
      onImported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '反映に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: '95vw' }}>
        <div className="modal-head">
          <div className="modal-title">SW日を反映</div>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            見出し行を含む表をそのまま貼り付けてください(「申込番号」「SW日」の列を使い、他の列は無視します)。
            申込番号が一致する案件の SW日 に反映します(全角/半角・空白・英字の大小は無視して照合)。案件の新規作成はしません。
            手打ちで入れた SW日 は上書きせず、空欄と前回の一括投入で入った SW日 だけを記載します。
          </p>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
          {summary && (
            <p style={{ color: 'var(--color-success)', fontSize: 12 }}>
              貼り付けた{summary.rowsRead}行のうち、申込番号が一致した案件{summary.matched}件のうち{summary.updated}件に SW日 を反映しました。
              {summary.protectedFields > 0 && (
                <>
                  <br />
                  手打ちで入力済みの SW日 {summary.protectedFields}件は上書きしませんでした。
                </>
              )}
              {summary.noDate > 0 && (
                <>
                  <br />
                  SW日が空欄・読めない行が{summary.noDate}行ありました(反映していません)。
                </>
              )}
              {summary.notFound.length > 0 && (
                <>
                  <br />
                  案件に無い申込番号 {summary.notFound.length}件: {summary.notFound.slice(0, 10).join('、')}
                  {summary.notFound.length > 10 ? ' ほか' : ''}
                </>
              )}
            </p>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="見出し行を含む表をここに貼り付け"
            rows={12}
            style={{ padding: 8, fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }}
          />
        </div>
        <div className="modal-foot">
          <button onClick={onClose} disabled={submitting}>
            閉じる
          </button>
          <button className="btn-primary" onClick={submit} disabled={submitting || !text.trim()}>
            {submitting ? '反映中...' : '反映する'}
          </button>
        </div>
      </div>
    </div>
  );
}
