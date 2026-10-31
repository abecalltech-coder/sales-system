import { useState } from 'react';
import { StatusMasterItem, TossCaseListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { isoToDateKey, parseDateText, parseTimeText } from '../../lib/dateInput';
import { parseTsv } from '../../lib/tsv';

// 対応中フラグ=トス実績の「架電中」ボタン(要望)。シートでは「対応中」と入っている
const CALLING_TRUE = /^(対応中|架電中|済|✓|1|true|yes|○|◯)$/i;
const CALL_DIRECTIONS = ['架電', '入電'];
// アポ詳細を作る進捗(一覧の isConversionProgress と同じ判定)
const CONVERSION_CODES = ['PROGRESS_PRE_CONFIRM_OK', 'PROGRESS_APPOINTMENT'];

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
  region: '地域',
  proposal: '提案',
  progress: '進捗',
  ngReason: 'NG理由',
  listName: 'リスト',
  callDirection: '架電or入電',
  industry: '業種',
  hook: 'フック',
  existingContract: '既契約',
  appointmentMemo: 'アポFMT',
} as const;

/** 確認画面に出す1行(前確・進捗・NG理由はマスタの id に直す前の表示名のまま持つ) */
interface Draft {
  tossDate: string; // 10/1(表示用)
  tossTime: string;
  values: Record<string, unknown>;
  preConfirm: string;
  progress: string;
  ngReason: string;
  makesAppointment: boolean;
}

/** 一覧APIはpageSizeの上限が100のため、重複判定用に全件をページングして取得する */
async function fetchAllTossCases(): Promise<TossCaseListItem[]> {
  const all: TossCaseListItem[] = [];
  let page = 1;
  for (;;) {
    const res = await api.get<{ items: TossCaseListItem[]; total: number }>(`/toss-cases?page=${page}&pageSize=20000`);
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
    page += 1;
  }
  return all;
}

/** "2026-10-01" → "10/1"(要望: トス日は年なしで表示) */
const monthDay = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
};

/**
 * トス実績の一括投入(要望)。案件管理と同じ「表をそのまま貼り付け→見出し行の列名で
 * 対応する項目に取り込む」方式。貼り付け後に確認画面を挟み、内容を見てから取り込む。
 * 店舗連絡先・住所は表の値をそのまま入れる(要望)。進捗が前確OKの行はアポ詳細も作り、本文に「アポFMT」列を使う。
 * 「アポ実績入力」「転送」はトス案件に対応する項目が無いため取り込まない。
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<{ drafts: Draft[]; skipped: number; duplicates: number } | null>(null);
  const [summary, setSummary] = useState<{ created: number; appointments: number; addedOptions: number } | null>(null);

  // トス日(日単位)+店舗名が一致する行は重複として取り込まない(要望)
  const dedupKey = (dateIso: string, store: string) => `${isoToDateKey(dateIso)}|${store.trim().toLowerCase()}`;
  const isConversion = (label: string) =>
    label === '前確OK' || progressOptions.some((o) => o.displayName === label && CONVERSION_CODES.includes(o.internalCode));

  /** 貼り付けた表を読み、確認画面用の行を作る */
  const readTable = async () => {
    setError(null);
    const table = parseTsv(text);
    if (table.length < 2) {
      setError('見出し行を含む表を貼り付けてください(1行目が項目名、2行目以降がデータ)');
      return;
    }
    const header = table[0].map((h) => h.trim());
    const idx = (label: string) => header.findIndex((h) => h === label);
    const col = Object.fromEntries(Object.entries(HEADER_LABELS).map(([k, label]) => [k, idx(label)])) as Record<keyof typeof HEADER_LABELS, number>;
    const addressCol = header.findIndex((h) => h.startsWith('住所'));
    if (Object.values(col).every((i) => i < 0) && addressCol < 0) {
      setError('見出し行に対象の列が見つかりません');
      return;
    }

    setBusy(true);
    try {
      const existing = await fetchAllTossCases();
      const existingKeys = new Set(
        existing.filter((it) => it.receivedAt && it.customer?.corporateName).map((it) => dedupKey(it.receivedAt, it.customer!.corporateName!)),
      );
      const batchKeys = new Set<string>();
      const drafts: Draft[] = [];
      let skipped = 0;
      let duplicates = 0;

      for (const line of table.slice(1)) {
        const get = (i: number) => (i >= 0 ? (line[i] ?? '').trim() : '');
        const values: Record<string, unknown> = {};
        const set = (key: string, v: string) => {
          if (v) values[key] = v;
        };

        let tossDate = '';
        const tossTime = parseTimeText(get(col.tossTime)) || '';
        const dateKey = parseDateText(get(col.tossDate));
        if (dateKey) {
          values.receivedAt = new Date(`${dateKey}T${tossTime || '00:00'}`).toISOString();
          tossDate = monthDay(dateKey);
        }
        const nextKey = parseDateText(get(col.nextActionDate));
        if (nextKey) values.nextActionAt = new Date(`${nextKey}T${parseTimeText(get(col.nextActionTime)) || '00:00'}`).toISOString();
        set('apStaffName', get(col.ap));
        set('department', get(col.department));
        if (CALLING_TRUE.test(get(col.calling))) values.isCallingInProgress = true;
        set('corporateName', get(col.corporateName));
        set('memo', get(col.memo));
        set('contactName', get(col.contactName));
        set('phone', get(col.phone));
        set('region', get(col.region));
        set('address', get(addressCol));
        set('proposal', get(col.proposal));
        set('listName', get(col.listName));
        if (CALL_DIRECTIONS.includes(get(col.callDirection))) values.callDirection = get(col.callDirection);
        set('industry', get(col.industry));
        set('hook', get(col.hook));
        set('existingContract', get(col.existingContract));
        const preConfirm = get(col.preConfirm);
        const progress = get(col.progress);
        const ngReason = get(col.ngReason);
        const makesAppointment = !!progress && isConversion(progress);
        if (makesAppointment) set('appointmentMemo', get(col.appointmentMemo));

        if (Object.keys(values).length === 0 && !preConfirm && !progress && !ngReason) {
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
        drafts.push({ tossDate, tossTime, values, preConfirm, progress, ngReason, makesAppointment });
      }
      if (drafts.length === 0) {
        setError(
          skipped > 0 || duplicates > 0
            ? `取り込めるデータがありませんでした(空行${skipped}件・重複${duplicates}件を除外)`
            : '取り込めるデータ行がありませんでした',
        );
        return;
      }
      setCheck({ drafts, skipped, duplicates });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '読み込みに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!check) return;
    setError(null);
    setBusy(true);
    let addedOptions = 0;
    try {
      // 前確・進捗・NG理由は既存の選択肢に無い値(例: マスタ未登録のスタッフ名)でも
      // データを失わずに取り込めるよう、一致しなければ新しい選択肢として自動追加する
      // (要望: 一括投入で情報が正しく入らない不具合の調査・改善。案件管理の一括投入と同じ考え方)。
      const optionsCache = new Map<string, StatusMasterItem[]>([
        ['TOSS_PRE_CONFIRM', [...preConfirmOptions]],
        ['TOSS_PROGRESS', [...progressOptions]],
        ['TOSS_NG_REASON', [...ngReasonOptions]],
      ]);
      const resolveStatusId = async (category: string, label: string): Promise<string | undefined> => {
        if (!label) return undefined;
        const opts = optionsCache.get(category) ?? [];
        const exact = opts.find((o) => o.displayName === label);
        if (exact) return exact.id;
        const created = await api.post<StatusMasterItem>('/status-master', {
          category,
          internalCode: `${category}_IMPORT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          displayName: label,
        });
        optionsCache.set(category, [...opts, created]);
        addedOptions += 1;
        return created.id;
      };

      const rows: Record<string, unknown>[] = [];
      for (const d of check.drafts) {
        const row = { ...d.values };
        const pre = await resolveStatusId('TOSS_PRE_CONFIRM', d.preConfirm);
        if (pre) row.preConfirmStatusId = pre;
        const prog = await resolveStatusId('TOSS_PROGRESS', d.progress);
        if (prog) row.progressStatusId = prog;
        const ng = await resolveStatusId('TOSS_NG_REASON', d.ngReason);
        if (ng) row.ngReasonStatusId = ng;
        rows.push(row);
      }
      const res = await api.post<{ count: number; appointmentCount?: number }>('/toss-cases/bulk-create', { rows });
      setSummary({ created: res.count, appointments: res.appointmentCount ?? 0, addedOptions });
      setCheck(null);
      onImported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '取り込みに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const cell: React.CSSProperties = { padding: '3px 6px', borderBottom: '1px solid var(--color-sunken)', whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' };
  const head: React.CSSProperties = { ...cell, position: 'sticky', top: 0, background: 'var(--color-subtle)', color: 'var(--color-text-muted)', fontSize: 11, textAlign: 'left' };
  const stat = (label: string, n: number, color: string) => (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '4px 10px', minWidth: 90 }}>
      <b style={{ display: 'block', fontSize: 16, color }}>{n}</b>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</span>
    </div>
  );

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: check ? 1100 : 640, maxWidth: '95vw' }}>
        <div className="modal-head">
          <div className="modal-title">トス案件を一括投入{check ? '(内容の確認)' : ''}</div>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
          {summary && (
            <p style={{ color: 'var(--color-success)', fontSize: 12 }}>
              {summary.created}件のトス案件を作成しました。
              {summary.appointments > 0 && <>前確OKの{summary.appointments}件はアポ詳細も作成しました。</>}
              {summary.addedOptions > 0 && (
                <>
                  <br />
                  前確・進捗・NG理由に無かった選択肢を{summary.addedOptions}件、マスタへ新規追加しました。
                </>
              )}
            </p>
          )}

          {check ? (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {stat('取り込む行', check.drafts.length, 'var(--color-success)')}
                {stat('アポ詳細も作る(前確OK)', check.drafts.filter((d) => d.makesAppointment).length, 'var(--color-primary)')}
                {stat('重複(トス日+店舗名)', check.duplicates, 'var(--color-text-faint)')}
                {stat('空行', check.skipped, 'var(--color-text-faint)')}
              </div>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.6 }}>
                店舗連絡先・住所は表の値をそのまま入れます。対応中フラグが「対応中」の行は架電中にします。
                前確OKの行はアポ詳細も作り、本文に「アポFMT」列を使います(空ならアポ詳細FMTから作成)。
                次回対応日が別の月の行は、トス日の月と次回対応日の月の両方の一覧に出ます。
                「アポ実績入力」「転送」の列は取り込みません。
              </p>
              <div style={{ maxHeight: '50vh', overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                  <thead>
                    <tr>
                      {['トス日', 'トス時間', 'AP', '前確', '部署', '架電中', '店舗名', '担当者名', '店舗連絡先', '地域', '住所', '提案', '進捗', 'NG理由', 'リスト', '架電or入電', '業種', 'フック', '既契約', 'アポ詳細'].map((h) => (
                        <th key={h} style={head}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {check.drafts.map((d, i) => (
                      <tr key={i}>
                        <td style={cell}>{d.tossDate}</td>
                        <td style={cell}>{d.tossTime}</td>
                        <td style={cell}>{str(d.values.apStaffName)}</td>
                        <td style={cell}>{d.preConfirm}</td>
                        <td style={cell}>{str(d.values.department)}</td>
                        <td style={{ ...cell, color: 'var(--color-danger)' }}>{d.values.isCallingInProgress ? '架電中' : ''}</td>
                        <td style={cell} title={str(d.values.corporateName)}>
                          {str(d.values.corporateName)}
                        </td>
                        <td style={cell}>{str(d.values.contactName)}</td>
                        <td style={cell}>{str(d.values.phone)}</td>
                        <td style={cell}>{str(d.values.region)}</td>
                        <td style={cell} title={str(d.values.address)}>
                          {str(d.values.address)}
                        </td>
                        <td style={cell}>{str(d.values.proposal)}</td>
                        <td style={cell}>{d.progress}</td>
                        <td style={cell}>{d.ngReason}</td>
                        <td style={cell} title={str(d.values.listName)}>
                          {str(d.values.listName)}
                        </td>
                        <td style={cell}>{str(d.values.callDirection)}</td>
                        <td style={cell}>{str(d.values.industry)}</td>
                        <td style={cell}>{str(d.values.hook)}</td>
                        <td style={cell}>{str(d.values.existingContract)}</td>
                        <td style={{ ...cell, color: 'var(--color-primary)' }}>{d.makesAppointment ? '作成' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                見出し行を含む表をそのまま貼り付けてください。以下の列だけを取り込みます(他の列は無視されます)。
              </p>
              <div style={{ fontSize: 11, color: 'var(--color-text-faint)', lineHeight: 1.6 }}>{Object.values(HEADER_LABELS).join(' / ')} / 住所</div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="見出し行を含む表をここに貼り付け"
                rows={12}
                style={{ padding: 8, fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }}
              />
            </>
          )}
        </div>
        <div className="modal-foot">
          {check && (
            <button onClick={() => setCheck(null)} disabled={busy}>
              戻って貼り直す
            </button>
          )}
          <button onClick={onClose} disabled={busy}>
            閉じる
          </button>
          {check ? (
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? '取り込み中...' : `${check.drafts.length}件を取り込む`}
            </button>
          ) : (
            <button className="btn-primary" onClick={readTable} disabled={busy || !text.trim()}>
              {busy ? '読み込み中...' : '内容を確認'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
