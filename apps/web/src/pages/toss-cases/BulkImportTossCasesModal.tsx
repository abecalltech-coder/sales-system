import { useState } from 'react';
import { StatusMasterItem, TossCaseListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { isoToDateKey, parseDateText, parseTimeText } from '../../lib/dateInput';

const CALLING_TRUE = /^(済|✓|1|true|yes|○|◯)$/i;
const CALL_DIRECTIONS = ['架電', '入電'];

// 外部シートの見出し(要望で指定された列名)。「住所」は表記ゆれ(括弧の注記付き等)を
// 許容するため startsWith で判定する。
const HEADER_LABELS = {
  tossDate: 'トス日',
  tossTime: 'トス時間',
  nextActionDate: '次回対応日',
  nextActionTime: '対応時間',
  ap: 'AP',
  preConfirm: '前確',
  department: '部署',
  calling: '対応中フラグ',
  corporateName: '店舗名',
  memo: '備考',
  contactName: '担当者名',
  phone: '店舗連絡先',
  proposal: '提案',
  progress: '進捗',
  ngReason: 'NG理由',
  listName: 'リスト',
  callDirection: '架電or入電',
  industry: '業種',
  hook: 'フック',
  existingContract: '既契約',
} as const;

function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => l.split('\t'));
}

/** 一覧APIはpageSizeの上限が100のため、重複判定用に全件をページングして取得する */
async function fetchAllTossCases(): Promise<TossCaseListItem[]> {
  const all: TossCaseListItem[] = [];
  let page = 1;
  for (;;) {
    const res = await api.get<{ items: TossCaseListItem[]; total: number }>(`/toss-cases?page=${page}&pageSize=100`);
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
    page += 1;
  }
  return all;
}

/**
 * トス実績の一括投入(要望)。案件管理と同じ「表をそのまま貼り付け→見出し行の列名で
 * 対応する項目に取り込む」方式。「地域」は住所から自動判定される項目のため取り込み対象外、
 * 「アポ実績入力」「転送」「アポFMT」はトス案件に対応する項目が無いため取り込まない。
 */
export function BulkImportTossCasesModal({
  preConfirmOptions,
  progressOptions,
  ngReasonOptions,
  onClose,
  onImported,
}: {
  preConfirmOptions: StatusMasterItem[];
  progressOptions: StatusMasterItem[];
  ngReasonOptions: StatusMasterItem[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: number; skipped: number; duplicates: number } | null>(null);

  const statusIdByLabel = (opts: StatusMasterItem[], label: string): string | undefined =>
    opts.find((o) => o.displayName === label)?.id;

  // トス日(日単位)+店舗名が一致する行は重複として取り込まない(要望)
  const dedupKey = (dateIso: string, store: string) => `${isoToDateKey(dateIso)}|${store.trim().toLowerCase()}`;

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
    const idx = (label: string) => header.findIndex((h) => h.trim() === label);
    const col = {
      tossDate: idx(HEADER_LABELS.tossDate),
      tossTime: idx(HEADER_LABELS.tossTime),
      nextActionDate: idx(HEADER_LABELS.nextActionDate),
      nextActionTime: idx(HEADER_LABELS.nextActionTime),
      ap: idx(HEADER_LABELS.ap),
      preConfirm: idx(HEADER_LABELS.preConfirm),
      department: idx(HEADER_LABELS.department),
      calling: idx(HEADER_LABELS.calling),
      corporateName: idx(HEADER_LABELS.corporateName),
      memo: idx(HEADER_LABELS.memo),
      contactName: idx(HEADER_LABELS.contactName),
      phone: idx(HEADER_LABELS.phone),
      address: header.findIndex((h) => h.trim().startsWith('住所')),
      proposal: idx(HEADER_LABELS.proposal),
      progress: idx(HEADER_LABELS.progress),
      ngReason: idx(HEADER_LABELS.ngReason),
      listName: idx(HEADER_LABELS.listName),
      callDirection: idx(HEADER_LABELS.callDirection),
      industry: idx(HEADER_LABELS.industry),
      hook: idx(HEADER_LABELS.hook),
      existingContract: idx(HEADER_LABELS.existingContract),
    };
    if (Object.values(col).every((i) => i < 0)) {
      setError('見出し行に対象の列が見つかりません');
      return;
    }

    setSubmitting(true);
    let skipped = 0;
    let duplicates = 0;
    const rows: Record<string, unknown>[] = [];
    try {
      // 重複判定のため既存のトス案件を全件取得しておく(トス日+店舗名が一致するものは取り込まない)
      const existing = await fetchAllTossCases();
      const existingKeys = new Set(
        existing.filter((it) => it.receivedAt && it.customer?.corporateName).map((it) => dedupKey(it.receivedAt, it.customer!.corporateName!)),
      );
      const batchKeys = new Set<string>();

      for (const line of dataLines) {
        const get = (i: number) => (i >= 0 ? (line[i] ?? '').trim() : '');
        const values: Record<string, unknown> = {};

        const tossDate = get(col.tossDate);
        if (tossDate) {
          const p = parseDateText(tossDate);
          if (p) values.receivedAt = new Date(`${p}T${parseTimeText(get(col.tossTime)) || '00:00'}`).toISOString();
        }
        const nextActionDate = get(col.nextActionDate);
        if (nextActionDate) {
          const p = parseDateText(nextActionDate);
          if (p) values.nextActionAt = new Date(`${p}T${parseTimeText(get(col.nextActionTime)) || '00:00'}`).toISOString();
        }
        const ap = get(col.ap);
        if (ap) values.apStaffName = ap;
        const preConfirm = get(col.preConfirm);
        if (preConfirm) {
          const id = statusIdByLabel(preConfirmOptions, preConfirm);
          if (id) values.preConfirmStatusId = id;
        }
        const department = get(col.department);
        if (department) values.department = department;
        const calling = get(col.calling);
        if (calling) values.isCallingInProgress = CALLING_TRUE.test(calling);
        const corporateName = get(col.corporateName);
        if (corporateName) values.corporateName = corporateName;
        const memo = get(col.memo);
        if (memo) values.memo = memo;
        const contactName = get(col.contactName);
        if (contactName) values.contactName = contactName;
        const phone = get(col.phone);
        if (phone) values.phone = phone;
        const address = get(col.address);
        if (address) values.address = address;
        const proposal = get(col.proposal);
        if (proposal) values.proposal = proposal;
        const progress = get(col.progress);
        if (progress) {
          const id = statusIdByLabel(progressOptions, progress);
          if (id) values.progressStatusId = id;
        }
        const ngReason = get(col.ngReason);
        if (ngReason) {
          const id = statusIdByLabel(ngReasonOptions, ngReason);
          if (id) values.ngReasonStatusId = id;
        }
        const listName = get(col.listName);
        if (listName) values.listName = listName;
        const callDirection = get(col.callDirection);
        if (CALL_DIRECTIONS.includes(callDirection)) values.callDirection = callDirection;
        const industry = get(col.industry);
        if (industry) values.industry = industry;
        const hook = get(col.hook);
        if (hook) values.hook = hook;
        const existingContract = get(col.existingContract);
        if (existingContract) values.existingContract = existingContract;

        if (Object.keys(values).length === 0) {
          skipped += 1;
          continue;
        }
        if (typeof values.receivedAt === 'string' && typeof values.corporateName === 'string') {
          const key = dedupKey(values.receivedAt, values.corporateName);
          if (existingKeys.has(key) || batchKeys.has(key)) {
            duplicates += 1;
            continue;
          }
          batchKeys.add(key);
        }
        rows.push(values);
      }
      if (rows.length === 0) {
        setError(
          skipped > 0 || duplicates > 0
            ? `取り込めるデータがありませんでした(空行${skipped}件・重複${duplicates}件を除外)`
            : '取り込めるデータ行がありませんでした',
        );
        setSubmitting(false);
        return;
      }
      const res = await api.post<{ count: number }>('/toss-cases/bulk-create', { rows });
      setSummary({ created: res.count, skipped, duplicates });
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
          <div className="modal-title">トス案件を一括投入</div>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            見出し行を含む表をそのまま貼り付けてください。以下の列だけを取り込みます(他の列は無視されます)。
          </p>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)', lineHeight: 1.6 }}>
            {Object.values(HEADER_LABELS).join(' / ')} / 住所
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
          {summary && (
            <p style={{ color: 'var(--color-success)', fontSize: 12 }}>
              {summary.created}件のトス案件を作成しました。
              {summary.duplicates > 0 && (
                <>
                  <br />
                  トス日・店舗名が一致する重複{summary.duplicates}件は除外しました。
                </>
              )}
              {summary.skipped > 0 && (
                <>
                  <br />
                  取り込める項目が無かった{summary.skipped}件は除外しました。
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
