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
    tasks: { exists: number; created: number; none: { label: string; reason: string }[]; monthDiff: { label: string; sheet: string; expected: string }[] };
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
    const swByNo = new Map<string, { raw: string; iso: string; cancelMonth: string }>();
    const cancelIdx = header.indexOf('解約連絡月');
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
      swByNo.set(no, {
        raw: (line[noIdx] ?? '').trim(),
        iso: new Date(`${p}T00:00:00`).toISOString(),
        cancelMonth: cancelIdx >= 0 ? (line[cancelIdx] ?? '').normalize('NFKC').replace(/\D/g, '') : '',
      });
    }
    if (swByNo.size === 0) {
      setError('SW日が入っている行がありませんでした');
      return;
    }

    setSubmitting(true);
    try {
      const existing = await api.get<{ items: DealListItem[] }>('/deals?page=1&pageSize=5000');
      const updates: { id: string; values: Record<string, unknown> }[] = [];
      const infoById = new Map<string, { label: string; cancelMonth: string }>();
      const caseNameField = fields.find((f) => f.fieldKey === 'case_name');
      const found = new Set<string>();
      for (const d of existing.items) {
        const no = appNoKeyOf(d.values[appNoField.fieldKey]);
        const hit = no ? swByNo.get(no) : undefined;
        if (!hit) continue;
        found.add(no);
        updates.push({ id: d.id, values: { [swField.fieldKey]: hit.iso } });
        const nm = caseNameField ? d.values[caseNameField.fieldKey] : '';
        infoById.set(d.id, { label: `${hit.raw}${typeof nm === 'string' && nm ? ` ${nm}` : ''}`, cancelMonth: hit.cancelMonth });
      }
      const notFound = [...swByNo.entries()].filter(([k]) => !found.has(k)).map(([, v]) => v.raw);
      if (updates.length === 0) {
        setError('申込番号が一致する案件がありませんでした');
        return;
      }
      const res = await api.post<{
        updated: number;
        protectedFields: number;
        taskCheck?: { dealId: string; dueAt: string | null; state: 'exists' | 'created' | 'none'; reason: string | null }[];
      }>('/deals/bulk-create', { rows: [], updates });
      // 解約連絡月の1日のタスクの確認結果(無ければサーバーが作成済み)
      const tasks = { exists: 0, created: 0, none: [] as { label: string; reason: string }[], monthDiff: [] as { label: string; sheet: string; expected: string }[] };
      for (const t of res.taskCheck ?? []) {
        const info = infoById.get(t.dealId);
        const label = info?.label ?? t.dealId;
        if (t.state === 'exists') tasks.exists += 1;
        else if (t.state === 'created') tasks.created += 1;
        else tasks.none.push({ label, reason: t.reason ?? '' });
        if (t.dueAt && info?.cancelMonth) {
          const j = new Date(new Date(t.dueAt).getTime() + 9 * 3600_000);
          const expected = `${j.getUTCFullYear()}${String(j.getUTCMonth() + 1).padStart(2, '0')}`;
          if (info.cancelMonth !== expected) tasks.monthDiff.push({ label, sheet: info.cancelMonth, expected });
        }
      }
      setSummary({ rowsRead, matched: updates.length, updated: res.updated ?? 0, protectedFields: res.protectedFields ?? 0, noDate, notFound, tasks });
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
            あわせて、一致した案件の「解約連絡月の1日(SW日の月から4ヶ月目)」のタスクがあるか確認し、無ければ作成します(店サポ解約誘導=有・CLありの案件)。表に「解約連絡月」の列があれば、タスクの月と合っているかも確認します。
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
              <br />
              解約連絡月の1日のタスク: 既にあった{summary.tasks.exists}件、無かったため作成{summary.tasks.created}件
              {summary.tasks.none.length > 0 && (
                <span style={{ color: 'var(--color-danger)' }}>
                  <br />
                  作成されなかった{summary.tasks.none.length}件(理由): {summary.tasks.none.slice(0, 10).map((x) => `${x.label}(${x.reason})`).join('、')}
                  {summary.tasks.none.length > 10 ? ' ほか' : ''}
                </span>
              )}
              {summary.tasks.monthDiff.length > 0 && (
                <span style={{ color: 'var(--color-danger)' }}>
                  <br />
                  表の解約連絡月とタスクの月が違う{summary.tasks.monthDiff.length}件: {summary.tasks.monthDiff.slice(0, 10).map((x) => `${x.label}(表${x.sheet}/タスク${x.expected})`).join('、')}
                  {summary.tasks.monthDiff.length > 10 ? ' ほか' : ''}
                </span>
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
