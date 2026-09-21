import { useState } from 'react';
import { StatusMasterItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { parseDateText, parseTimeText } from '../../lib/dateInput';

const PROPOSED_TRUE = /^(済|✓|1|true|yes|○|◯)$/i;

// 外部シートの見出し(要望で指定された列名)。「地域」は住所から自動判定される項目のため、
// 「再前確担当」「アポランク」「申込番号」はアポ詳細に対応する項目が無いため取り込み対象外。
const HEADER_LABELS = {
  apoDate: 'アポ日',
  meetingDate: '商談日',
  meetingTime: '商談時間',
  ap: 'AP',
  preConfirm: '前確',
  preContact: '前連担当',
  closer: 'CL',
  hook: 'フック',
  department: '部署',
  corporateName: '店舗名',
  memo: '備考',
  industry: '業種',
  importantMattersOkAt: '重説OK日',
  electronicContractAt: 'ET日',
  nextActionAt: '決着予定日',
  contactName: '担当者名',
  phone: '店舗連絡先',
  address: '住所',
  type: '種別',
  progress: '進捗',
  listName: 'リスト',
  acquisitionMethod: '獲得方法',
  proposalLocation: '提案場所',
  existingContract: '既契約',
  anshinBizProposed: 'あんしんBiz(提案)',
  anshinBizStatus: 'あんしんBiz',
  anshinBizLostReason: 'あんしんBiz 失注理由',
  anshinBizPoints: 'あんしんBiz Pt',
  mobileProposed: 'モバイル（提案）',
  mobileStatus: 'モバイル',
  mobileLostReason: 'モバイル失注理由',
  funfoProposed: 'funfo（提案）',
  funfoStatus: 'funfo',
  funfoLostReason: 'funfo失注理由',
  deductionNote: '※減算※',
  consentFormType: '同意書種別',
  deliveryMethod: '交付方法',
  deliveryStatus: '交付状況',
  deliveredAt: '交付日',
  email: 'SMS送付用携帯番号（メールアドレス）',
  specialNotes: 'メモ・特記事項',
} as const;

function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => l.split('\t'));
}

export function BulkImportAppointmentsModal({
  preConfirmOptions,
  preContactOptions,
  closerOptions,
  departmentOptions,
  typeOptions,
  progressOptions,
  acquisitionMethodOptions,
  anshinBizStatusOptions,
  anshinBizLostReasonOptions,
  mobileStatusOptions,
  mobileLostReasonOptions,
  funfoStatusOptions,
  funfoLostReasonOptions,
  consentFormTypeOptions,
  deliveryMethodOptions,
  deliveryStatusOptions,
  onClose,
  onImported,
}: {
  preConfirmOptions: StatusMasterItem[];
  preContactOptions: StatusMasterItem[];
  closerOptions: StatusMasterItem[];
  departmentOptions: StatusMasterItem[];
  typeOptions: StatusMasterItem[];
  progressOptions: StatusMasterItem[];
  acquisitionMethodOptions: StatusMasterItem[];
  anshinBizStatusOptions: StatusMasterItem[];
  anshinBizLostReasonOptions: StatusMasterItem[];
  mobileStatusOptions: StatusMasterItem[];
  mobileLostReasonOptions: StatusMasterItem[];
  funfoStatusOptions: StatusMasterItem[];
  funfoLostReasonOptions: StatusMasterItem[];
  consentFormTypeOptions: StatusMasterItem[];
  deliveryMethodOptions: StatusMasterItem[];
  deliveryStatusOptions: StatusMasterItem[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ created: number; skipped: number } | null>(null);

  const idByLabel = (opts: StatusMasterItem[], label: string): string | undefined => opts.find((o) => o.displayName === label)?.id;

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
    const col = Object.fromEntries(Object.entries(HEADER_LABELS).map(([key, label]) => [key, idx(label)])) as Record<
      keyof typeof HEADER_LABELS,
      number
    >;
    if (Object.values(col).every((i) => i < 0)) {
      setError('見出し行に対象の列が見つかりません');
      return;
    }

    setSubmitting(true);
    let skipped = 0;
    const rows: Record<string, unknown>[] = [];
    try {
      for (const line of dataLines) {
        const get = (key: keyof typeof HEADER_LABELS) => {
          const i = col[key];
          return i >= 0 ? (line[i] ?? '').trim() : '';
        };
        const values: Record<string, unknown> = {};

        const apoDate = get('apoDate');
        if (apoDate) {
          const p = parseDateText(apoDate);
          if (p) values.createdAt = new Date(`${p}T00:00:00`).toISOString();
        }
        const meetingDate = get('meetingDate');
        if (meetingDate) {
          const p = parseDateText(meetingDate);
          if (p) values.meetingStartAt = new Date(`${p}T${parseTimeText(get('meetingTime')) || '00:00'}`).toISOString();
        }
        const ap = get('ap');
        if (ap) values.apStaffName = ap;
        const preConfirm = get('preConfirm');
        if (preConfirm) {
          const id = idByLabel(preConfirmOptions, preConfirm);
          if (id) values.preConfirmStatusId = id;
        }
        const preContact = get('preContact');
        if (preContact) {
          const id = idByLabel(preContactOptions, preContact);
          if (id) values.preContactStatusId = id;
        }
        const closer = get('closer');
        if (closer) {
          const id = idByLabel(closerOptions, closer);
          if (id) values.closerStatusId = id;
        }
        const hook = get('hook');
        if (hook) values.hook = hook;
        const department = get('department');
        if (department) {
          const id = idByLabel(departmentOptions, department);
          if (id) values.department = id;
        }
        const corporateName = get('corporateName');
        if (corporateName) values.corporateName = corporateName;
        const memo = get('memo');
        if (memo) values.memo = memo;
        const industry = get('industry');
        if (industry) values.industry = industry;
        const importantMattersOkAt = get('importantMattersOkAt');
        if (importantMattersOkAt) {
          const p = parseDateText(importantMattersOkAt);
          if (p) values.importantMattersOkAt = new Date(`${p}T00:00:00`).toISOString();
        }
        const electronicContractAt = get('electronicContractAt');
        if (electronicContractAt) {
          const p = parseDateText(electronicContractAt);
          if (p) values.electronicContractAt = new Date(`${p}T00:00:00`).toISOString();
        }
        const nextActionAt = get('nextActionAt');
        if (nextActionAt) {
          const p = parseDateText(nextActionAt);
          if (p) values.nextActionAt = new Date(`${p}T00:00:00`).toISOString();
        }
        const contactName = get('contactName');
        if (contactName) values.contactName = contactName;
        const phone = get('phone');
        if (phone) values.phone = phone;
        const address = get('address');
        if (address) values.address = address;
        const type = get('type');
        if (type) {
          const id = idByLabel(typeOptions, type);
          if (id) values.typeStatusId = id;
        }
        const progress = get('progress');
        if (progress) {
          const id = idByLabel(progressOptions, progress);
          if (id) values.progressStatusId = id;
        }
        const listName = get('listName');
        if (listName) values.listName = listName;
        const acquisitionMethod = get('acquisitionMethod');
        if (acquisitionMethod) {
          const id = idByLabel(acquisitionMethodOptions, acquisitionMethod);
          if (id) values.acquisitionMethodStatusId = id;
        }
        const proposalLocation = get('proposalLocation');
        if (proposalLocation) values.proposalLocation = proposalLocation;
        const existingContract = get('existingContract');
        if (existingContract) values.existingContract = existingContract;
        const anshinBizProposed = get('anshinBizProposed');
        if (anshinBizProposed) values.anshinBizProposed = PROPOSED_TRUE.test(anshinBizProposed);
        const anshinBizStatus = get('anshinBizStatus');
        if (anshinBizStatus) {
          const id = idByLabel(anshinBizStatusOptions, anshinBizStatus);
          if (id) values.anshinBizStatusId = id;
        }
        const anshinBizLostReason = get('anshinBizLostReason');
        if (anshinBizLostReason) {
          const id = idByLabel(anshinBizLostReasonOptions, anshinBizLostReason);
          if (id) values.anshinBizLostReasonStatusId = id;
        }
        const anshinBizPoints = get('anshinBizPoints');
        if (anshinBizPoints) {
          const n = Number(anshinBizPoints.replace(/,/g, ''));
          if (Number.isFinite(n)) values.anshinBizPoints = n;
        }
        const mobileProposed = get('mobileProposed');
        if (mobileProposed) values.mobileProposed = PROPOSED_TRUE.test(mobileProposed);
        const mobileStatus = get('mobileStatus');
        if (mobileStatus) {
          const id = idByLabel(mobileStatusOptions, mobileStatus);
          if (id) values.mobileStatusId = id;
        }
        const mobileLostReason = get('mobileLostReason');
        if (mobileLostReason) {
          const id = idByLabel(mobileLostReasonOptions, mobileLostReason);
          if (id) values.mobileLostReasonStatusId = id;
        }
        const funfoProposed = get('funfoProposed');
        if (funfoProposed) values.funfoProposed = PROPOSED_TRUE.test(funfoProposed);
        const funfoStatus = get('funfoStatus');
        if (funfoStatus) {
          const id = idByLabel(funfoStatusOptions, funfoStatus);
          if (id) values.funfoStatusId = id;
        }
        const funfoLostReason = get('funfoLostReason');
        if (funfoLostReason) {
          const id = idByLabel(funfoLostReasonOptions, funfoLostReason);
          if (id) values.funfoLostReasonStatusId = id;
        }
        const deductionNote = get('deductionNote');
        if (deductionNote) values.deductionNote = deductionNote;
        const consentFormType = get('consentFormType');
        if (consentFormType) {
          const id = idByLabel(consentFormTypeOptions, consentFormType);
          if (id) values.consentFormTypeStatusId = id;
        }
        const deliveryMethod = get('deliveryMethod');
        if (deliveryMethod) {
          const id = idByLabel(deliveryMethodOptions, deliveryMethod);
          if (id) values.deliveryMethodStatusId = id;
        }
        const deliveryStatus = get('deliveryStatus');
        if (deliveryStatus) {
          const id = idByLabel(deliveryStatusOptions, deliveryStatus);
          if (id) values.deliveryStatusStatusId = id;
        }
        const deliveredAt = get('deliveredAt');
        if (deliveredAt) {
          const p = parseDateText(deliveredAt);
          if (p) values.deliveredAt = new Date(`${p}T00:00:00`).toISOString();
        }
        const email = get('email');
        if (email) values.email = email;
        const specialNotes = get('specialNotes');
        if (specialNotes) values.specialNotes = specialNotes;

        if (Object.keys(values).length === 0) {
          skipped += 1;
          continue;
        }
        rows.push(values);
      }
      if (rows.length === 0) {
        setError(skipped > 0 ? `取り込めるデータがありませんでした(空行 ${skipped}件を除外)` : '取り込めるデータ行がありませんでした');
        setSubmitting(false);
        return;
      }
      const res = await api.post<{ count: number }>('/appointments/bulk-create', { rows });
      setSummary({ created: res.count, skipped });
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
          <div className="modal-title">アポ詳細を一括投入</div>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            見出し行を含む表をそのまま貼り付けてください。以下の列だけを取り込みます(他の列は無視されます)。
          </p>
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)', lineHeight: 1.6 }}>{Object.values(HEADER_LABELS).join(' / ')}</div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
          {summary && (
            <p style={{ color: 'var(--color-success)', fontSize: 12 }}>
              {summary.created}件のアポ詳細を作成しました。
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
