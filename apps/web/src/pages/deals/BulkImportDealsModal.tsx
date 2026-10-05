import { useState } from 'react';
import { DealFieldItem, DealListItem, UserOption } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { isoToDateKey, parseDateText } from '../../lib/dateInput';
import { parseTsv } from '../../lib/tsv';

// 外部シートの列名 → 案件管理の項目名(要望で指定されたマッピング)
const SOURCE_TO_TARGET_LABEL: [string, string][] = [
  ['訪問日', '商談日'],
  ['CL', '担当者名'],
  ['フック', 'フック'],
  ['部署', '部署'],
  ['店舗名', '案件名'],
  ['ET日', 'エントリー日'],
  ['進捗', 'ステータス'],
  ['申込番号', '申込番号'],
  ['MCOK日', 'MC日'],
];

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
  const [summary, setSummary] = useState<{ created: number; updated: number; protectedFields: number; duplicates: number; skippedUsers: string[] } | null>(null);

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
    const fieldByKey = new Map(fields.map((f) => [f.fieldKey, f]));
    // SELECT列(フック・ステータス)の選択肢は貼り付け中だけローカルに保持し、
    // 同じ値が複数行にあっても選択肢を重複作成しないようにする
    const localOptions = new Map<string, { id: string; label: string }[]>();
    for (const f of fields) if (f.dataType === 'SELECT') localOptions.set(f.id, [...f.options]);

    // 取り込む項目が全て一致する行は重複として除外する(要望)。日付は時刻を無視し日単位で比較する。
    const valuesEqual = (key: string, a: unknown, b: unknown): boolean => {
      if (fieldByKey.get(key)?.dataType === 'DATE') {
        return isoToDateKey(typeof a === 'string' ? a : null) === isoToDateKey(typeof b === 'string' ? b : null);
      }
      return a === b;
    };
    const isSameRecord = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
      const keys = Object.keys(a);
      if (keys.length === 0) return false;
      return keys.every((k) => valuesEqual(k, a[k], b[k]));
    };
    /**
     * 重複の判定(要望): 案件名と申込番号が両方一致したら重複として除外する。
     * 案件名が同じでも申込番号が違えば別の申込として追加する。
     * 申込番号が空の行は、これまでどおり取り込む項目の完全一致で判定する。
     */
    const nameKey = fieldByLabel.get('案件名')?.fieldKey;
    const appNoKey = fieldByLabel.get('申込番号')?.fieldKey;
    const norm = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
    const isDuplicateOf = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
      if (nameKey && appNoKey && norm(a[appNoKey])) {
        return norm(a[nameKey]) === norm(b[nameKey]) && norm(a[appNoKey]) === norm(b[appNoKey]);
      }
      return isSameRecord(a, b);
    };

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
      // 重複判定のため既存の案件を全件取得しておく(取り込む項目だけを比較する)
      const existing = await api.get<{ items: DealListItem[] }>('/deals?page=1&pageSize=5000');
      const existingValuesList = existing.items.map((d) => d.values);
      const batchValuesList: Record<string, unknown>[] = [];

      const rows: { values: Record<string, unknown> }[] = [];
      // 案件名+申込番号が一致する既存の案件へは追記する(要望: 手打ちの値は上書きしない。判定はサーバー側)
      const updates: { id: string; values: Record<string, unknown> }[] = [];
      const updatedIds = new Set<string>();
      let duplicates = 0;
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
            // 登録アカウント名に前後の空白・改行が紛れていても一致するようtrimして比較する
            const u = userOptions.find((x) => x.name.trim() === raw);
            if (u) values[field.fieldKey] = u.id;
            else skippedUsers.add(raw);
          } else if (field.dataType === 'SELECT') {
            const optId = await resolveSelectOption(field, raw);
            if (optId) values[field.fieldKey] = optId;
          } else {
            values[field.fieldKey] = raw;
          }
        }
        if (Object.keys(values).length === 0) continue;
        if (nameKey && appNoKey && norm(values[appNoKey])) {
          const target = existing.items.find((d) => norm(d.values[nameKey]) === norm(values[nameKey]) && norm(d.values[appNoKey]) === norm(values[appNoKey]));
          if (target) {
            if (updatedIds.has(target.id)) duplicates += 1;
            else {
              updatedIds.add(target.id);
              updates.push({ id: target.id, values });
            }
            continue;
          }
        }
        const isDuplicate =
          existingValuesList.some((ev) => isDuplicateOf(values, ev)) || batchValuesList.some((bv) => isDuplicateOf(values, bv));
        if (isDuplicate) {
          duplicates += 1;
          continue;
        }
        batchValuesList.push(values);
        rows.push({ values });
      }
      if (rows.length === 0 && updates.length === 0) {
        setError(duplicates > 0 ? `全て重複していたため取り込みませんでした(${duplicates}件)` : '取り込めるデータ行がありませんでした');
        setSubmitting(false);
        return;
      }
      const res = await api.post<{ count: number; updated: number; protectedFields: number }>('/deals/bulk-create', { rows, updates });
      setSummary({ created: res.count, updated: res.updated ?? 0, protectedFields: res.protectedFields ?? 0, duplicates, skippedUsers: [...skippedUsers] });
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
            案件名と申込番号が既存の案件と両方一致する場合は、その案件へ記載します。手打ち・システム内で入力した値は上書きせず、空欄と前回の一括投入で入った項目だけを記載します。
            案件名が同じでも申込番号が違えば新しい案件として追加します。
            申込番号が空の行は、取り込む項目が完全一致する場合に除外します。一覧では案件名が同じ案件が自動で纏まって表示されます。
          </p>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)', lineHeight: 1.6 }}>
            {SOURCE_TO_TARGET_LABEL.map(([src, dst]) => `${src}→${dst}`).join(' / ')}
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
          {summary && (
            <p style={{ color: 'var(--color-success)', fontSize: 12 }}>
              {summary.created}件の案件を作成しました。
              {summary.updated > 0 && (
                <>
                  <br />
                  既存の案件{summary.updated}件に、空欄・前回の一括投入の項目を記載しました。
                </>
              )}
              {summary.protectedFields > 0 && (
                <>
                  <br />
                  手打ち・システム内で入力済みの{summary.protectedFields}項目は上書きしませんでした。
                </>
              )}
              {summary.duplicates > 0 && (
                <>
                  <br />
                  重複{summary.duplicates}件は除外しました。
                </>
              )}
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
