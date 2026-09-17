import { useState } from 'react';
import { DealFieldItem, UserOption } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { parseDateText } from '../../lib/dateInput';

// 外部シートの列名 → 案件管理の項目名(要望で指定されたマッピング)
const SOURCE_TO_TARGET_LABEL: [string, string][] = [
  ['訪問日', '訪問日'],
  ['CL', '担当者名'],
  ['フック', 'フック'],
  ['部署', '部署'],
  ['店舗名', '店舗名'],
  ['ET日', 'エントリー日'],
  ['進捗', 'ステータス'],
  ['申込番号', '申込番号'],
  ['MCOK日', 'MCOK日'],
];

function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => l.split('\t'));
}

/**
 * 外部シート(見出し行付きの表)をそのまま貼り付けて、指定した列だけを拾って
 * 案件を一括作成する(要望)。見出し行の列名でマッピングするため、貼り付ける表に
 * 余分な列があっても順序が違っても対象の列だけを正しく取り込める。
 */
export function BulkImportDealsModal({
  fields,
  userOptions,
  onClose,
  onImported,
}: {
  fields: DealFieldItem[];
  userOptions: UserOption[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: number; skippedUsers: string[] } | null>(null);

  const submit = async () => {
    setError(null);
    setSummary(null);
    const table = parseTsv(text);
    if (table.length < 2) {
      setError('見出し行を含む表を貼り付けてください(1行目が項目名、2行目以降がデータ)');
      return;
    }
    const header = table[0];
    const dataLines = table.slice(1);

    const sourceIdx = new Map<string, number>();
    for (const [src] of SOURCE_TO_TARGET_LABEL) {
      const idx = header.findIndex((h) => h.trim() === src);
      if (idx >= 0) sourceIdx.set(src, idx);
    }
    if (sourceIdx.size === 0) {
      setError('見出し行に対象の列(訪問日・CL・フック・部署・店舗名・ET日・進捗・申込番号・MCOK日)が見つかりません');
      return;
    }

    const fieldByLabel = new Map(fields.map((f) => [f.label, f]));
    // SELECT列(フック・ステータス)の選択肢は貼り付け中だけローカルに保持し、
    // 同じ値が複数行にあっても選択肢を重複作成しないようにする
    const localOptions = new Map<string, { id: string; label: string }[]>();
    for (const f of fields) if (f.dataType === 'SELECT') localOptions.set(f.id, [...f.options]);

    const resolveSelectOption = async (field: DealFieldItem, rawLabel: string): Promise<string | null> => {
      const t = rawLabel.trim();
      if (!t) return null;
      const opts = localOptions.get(field.id) ?? [];
      const exact = opts.find((o) => o.label === t);
      if (exact) return exact.id;
      // 一致する選択肢が無ければ新規に選択肢として追加する(データを失わないため)
      const created = await api.post<{ id: string; label: string }>(`/deals/fields/${field.id}/options`, { label: t });
      localOptions.set(field.id, [...opts, { id: created.id, label: created.label }]);
      return created.id;
    };

    setSubmitting(true);
    const skippedUsers = new Set<string>();
    try {
      const rows: { values: Record<string, unknown> }[] = [];
      for (const line of dataLines) {
        const values: Record<string, unknown> = {};
        for (const [src, targetLabel] of SOURCE_TO_TARGET_LABEL) {
          const idx = sourceIdx.get(src);
          if (idx === undefined) continue;
          const raw = (line[idx] ?? '').trim();
          if (!raw) continue;
          const field = fieldByLabel.get(targetLabel);
          if (!field) continue;
          if (field.dataType === 'DATE') {
            const p = parseDateText(raw);
            if (p) values[field.fieldKey] = new Date(`${p}T00:00:00`).toISOString();
          } else if (field.dataType === 'USER') {
            const u = userOptions.find((x) => x.name === raw);
            if (u) values[field.fieldKey] = u.id;
            else skippedUsers.add(raw);
          } else if (field.dataType === 'SELECT') {
            const optId = await resolveSelectOption(field, raw);
            if (optId) values[field.fieldKey] = optId;
          } else {
            values[field.fieldKey] = raw;
          }
        }
        if (Object.keys(values).length > 0) rows.push({ values });
      }
      if (rows.length === 0) {
        setError('取り込めるデータ行がありませんでした');
        setSubmitting(false);
        return;
      }
      const res = await api.post<{ count: number }>('/deals/bulk-create', { rows });
      setSummary({ created: res.count, skippedUsers: [...skippedUsers] });
      onImported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '取り込みに失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: '95vw' }}>
        <div className="modal-head">
          <div className="modal-title">案件を一括投入</div>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            見出し行を含む表をそのまま貼り付けてください。以下の列だけを取り込みます(他の列は無視されます)。
          </p>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)', lineHeight: 1.6 }}>
            {SOURCE_TO_TARGET_LABEL.map(([src, dst]) => `${src}→${dst}`).join(' / ')}
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
          {summary && (
            <p style={{ color: 'var(--color-success)', fontSize: 12 }}>
              {summary.created}件の案件を作成しました。
              {summary.skippedUsers.length > 0 && (
                <>
                  <br />
                  担当者名が一致しなかったため未設定にしました: {summary.skippedUsers.join('、')}
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
            {submitting ? '取り込み中...' : '取り込む'}
          </button>
        </div>
      </div>
    </div>
  );
}
