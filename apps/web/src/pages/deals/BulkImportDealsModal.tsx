import { useState } from 'react';
import { DealFieldItem, DealListItem, UserOption } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { isoToDateKey, parseDateText } from '../../lib/dateInput';
import { parseTsv } from '../../lib/tsv';
import { DEAL_USER_OTHER } from '../../lib/dealUsers';

interface ImportColumn {
  /** 貼り付ける表の列名 */
  src: string;
  /** 入れる項目(列名を画面で変えても追えるよう fieldKey で指定。無ければ label で探す) */
  key?: string;
  label: string;
  /** 値の変換。null を返すとその値は入れない */
  transform?: (raw: string) => string | null;
}

/**
 * 相対/供給管理費: 数値は「8.0円」の形に(6.0円〜12.0円のプルダウンに合わせる)、
 * 「15％」のような%表示はそのまま入れる(要望。無い選択肢は追加される)。「-」等は入れない
 */
function supplyFee(raw: string): string | null {
  const t = raw.trim();
  if (/^[0-9０-９.．]+\s*[%％]$/.test(t)) return t.replace(/\s+/g, '');
  const n = Number(t.replace(/[円\s,]/g, ''));
  if (!t || !Number.isFinite(n)) return null;
  return `${n.toFixed(1)}円`;
}

// 外部シートの列名 → 案件管理の項目(要望で指定されたマッピング)
const IMPORT_COLUMNS: ImportColumn[] = [
  { src: '訪問日', key: 'meeting_date', label: '商談日' },
  { src: '申込名義', key: 'application_name', label: '申込名義' },
  { src: '店舗名', key: 'case_name', label: '案件名' },
  { src: '進捗', key: 'status', label: 'ステータス' },
  { src: 'フック', key: 'hook', label: 'フック' },
  { src: 'CL', key: 'assignee_user_id', label: 'CL' },
  { src: '部署', key: 'department', label: '部署' },
  { src: '重説OK日', key: 'contract_date', label: '成約日' },
  { src: 'ET日', key: 'entry_date', label: 'ET日' },
  // 獲得プランに「TMS」があれば店サポ付帯有無=有、無ければ無(要望)
  { src: '獲得プラン', key: 'shop_support_attached', label: '店サポ付帯有無', transform: (raw) => (/TMS/i.test(raw) ? '有' : '無') },
  { src: 'オプション', key: 'option', label: 'オプション' },
  { src: '相対/供給管理費', key: 'supply_mgmt_fee', label: '相対/供給管理費', transform: supplyFee },
  { src: '申込番号', key: 'application_number', label: '申込番号' },
  { src: 'MCOK日', key: 'mc_date', label: 'MC日' },
];
const SHOP_SUPPORT_KEY = 'shop_support_attached';

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
  const [summary, setSummary] = useState<{
    rowsRead: number;
    created: number;
    updated: number;
    protectedFields: number;
    duplicates: number;
    skippedUsers: string[];
    noAppNo: number;
  } | null>(null);

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
    for (const c of IMPORT_COLUMNS) {
      const idx = header.findIndex((h) => h.trim() === c.src);
      if (idx >= 0) sourceIdx.set(c.src, idx);
    }
    if (sourceIdx.size === 0) {
      setError(`見出し行に対象の列(${IMPORT_COLUMNS.map((c) => c.src).join('・')})が見つかりません`);
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
    const fieldOf = (c: { key?: string; label: string }) => (c.key ? fieldByKey.get(c.key) : undefined) ?? fieldByLabel.get(c.label);
    const nameKey = fieldOf({ key: 'case_name', label: '案件名' })?.fieldKey;
    const appNoKey = fieldOf({ key: 'application_number', label: '申込番号' })?.fieldKey;
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
      // 店サポ付帯有無は「有り」「無し」等の表記違いでも既存の選択肢を使う
      if (field.fieldKey === SHOP_SUPPORT_KEY) {
        const near = opts.find((o) => o.label.startsWith(t));
        if (near) return near.id;
      }
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

      const rows: { values: Record<string, unknown> }[] = [];
      // 案件名+申込番号が一致する既存の案件へは追記する(要望: 手打ちの値は上書きしない。判定はサーバー側)
      const updates: { id: string; values: Record<string, unknown> }[] = [];
      let duplicates = 0;
      let rowsRead = 0;
      let noAppNo = 0;
      /**
       * 1行=1件(要望: 纏めない)。同じ申込番号の行(拠点ごと・従量/動力)もそれぞれ1件にする。
       * 再取り込みでは、同じ申込番号の既存の案件へ上から順に対応させて記載し、足りない分だけ追加する
       * (一括投入の案件は貼り付けた順に並ぶため、同じ表を貼り直せば同じ行に入る)
       */
      const existingByAppNo = new Map<string, DealListItem[]>();
      if (appNoKey) {
        // 作成順(同じ取り込み内は貼り付けた順)に並べて対応させる
        const ordered = [...existing.items].sort((x, y) => {
          const cx = (x as DealListItem & { createdAt?: string }).createdAt ?? '';
          const cy = (y as DealListItem & { createdAt?: string }).createdAt ?? '';
          return cx < cy ? -1 : cx > cy ? 1 : x.manualOrder - y.manualOrder;
        });
        for (const d of ordered) {
          const k = norm(d.values[appNoKey]);
          if (!k) continue;
          existingByAppNo.set(k, [...(existingByAppNo.get(k) ?? []), d]);
        }
      }
      const usedPerAppNo = new Map<string, number>();
      for (const line of dataLines) {
        const values: Record<string, unknown> = {};
        for (const col of IMPORT_COLUMNS) {
          const idx = sourceIdx.get(col.src);
          if (idx === undefined) continue;
          const original = (line[idx] ?? '').trim();
          if (!original) continue;
          const raw = col.transform ? col.transform(original) : original;
          if (!raw) continue;
          const field = fieldOf(col);
          if (!field) continue;
          if (field.dataType === 'DATE') {
            const p = parseDateText(raw);
            if (p) values[field.fieldKey] = new Date(`${p}T00:00:00`).toISOString();
          } else if (field.dataType === 'USER') {
            // 登録アカウント名に前後の空白・改行が紛れていても一致するようtrimして比較する
            const u = userOptions.find((x) => x.name.trim() === raw);
            if (u) values[field.fieldKey] = u.id;
            else {
              // アカウントと一致しない名前は「その他」へまとめる(要望)
              values[field.fieldKey] = DEAL_USER_OTHER;
              skippedUsers.add(raw);
            }
          } else if (field.dataType === 'SELECT') {
            const optId = await resolveSelectOption(field, raw);
            if (optId) values[field.fieldKey] = optId;
          } else {
            values[field.fieldKey] = raw;
          }
        }
        if (Object.keys(values).length === 0) continue;
        rowsRead += 1;
        if (appNoKey && norm(values[appNoKey])) {
          const k = norm(values[appNoKey]);
          const n = usedPerAppNo.get(k) ?? 0;
          usedPerAppNo.set(k, n + 1);
          const target = existingByAppNo.get(k)?.[n];
          if (target) {
            updates.push({ id: target.id, values });
            continue;
          }
          rows.push({ values });
          continue;
        }
        noAppNo += 1;
        const isDuplicate =
          existingValuesList.some((ev) => isDuplicateOf(values, ev));
        if (isDuplicate) {
          duplicates += 1;
          continue;
        }
        rows.push({ values });
      }
      if (rows.length === 0 && updates.length === 0) {
        setError(duplicates > 0 ? `全て重複していたため取り込みませんでした(${duplicates}件)` : '取り込めるデータ行がありませんでした');
        setSubmitting(false);
        return;
      }
      const res = await api.post<{ count: number; updated: number; protectedFields: number }>('/deals/bulk-create', { rows, updates });
      setSummary({
        rowsRead,
        created: res.count,
        updated: res.updated ?? 0,
        protectedFields: res.protectedFields ?? 0,
        duplicates,
        skippedUsers: [...skippedUsers],
        noAppNo,
      });
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
            貼り付けた1行ごとに1件の案件を作ります(同じ申込番号の行も纏めません)。同じ申込番号の案件が既にある場合は、上から順にその案件へ記載し、足りない分だけ追加します。
            手打ち・システム内で入力した値は上書きせず、空欄と前回の一括投入で入った項目だけを記載します。
            申込番号が空の行は、取り込む項目が完全一致する場合に除外します。一覧では案件名が同じ案件が自動で纏まって表示されます。
          </p>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)', lineHeight: 1.6 }}>
            {IMPORT_COLUMNS.map((c) => (c.key === SHOP_SUPPORT_KEY ? '獲得プラン(TMSあり)→店サポ付帯有無' : `${c.src}→${fields.find((f) => f.fieldKey === c.key)?.label ?? c.label}`)).join(' / ')}
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
          {summary && (
            <p style={{ color: 'var(--color-success)', fontSize: 12 }}>
              貼り付けた{summary.rowsRead}行から、{summary.created}件の案件を作成しました。
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
                  申込番号が空欄で、取り込む項目が既存の案件と完全一致する{summary.duplicates}行は除外しました。
                </>
              )}
              {summary.noAppNo > 0 && (
                <>
                  <br />
                  申込番号が空欄の行が{summary.noAppNo}行ありました(取り込む項目が完全一致する行は除外)。
                </>
              )}
              {summary.skippedUsers.length > 0 && (
                <>
                  <br />
                  アカウントと一致しないため「その他」にまとめました: {summary.skippedUsers.join('、')}
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
