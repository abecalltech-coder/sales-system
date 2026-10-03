import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { api, ApiError } from '../../lib/api';
import { logCopy } from '../../lib/copyLog';
import { recognizeBill, extractBillFields } from '../../lib/ocr';
import {
  APPLICATION_FIELDS,
  DORYOKU_FIELDS,
  FieldDef,
  INPUT_CODES,
  JURYO_FIELDS,
  Section,
  SheetData,
  emptySheetData,
  sheetText,
} from '../../lib/applicationSheet';

interface SheetRow {
  id: string;
  inputCode: string | null;
  hasJuryo: boolean;
  hasDoryoku: boolean;
  data: SheetData;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
}

type Draft = Omit<SheetRow, 'createdAt' | 'updatedAt' | 'createdByName' | 'updatedByName' | 'id'> & { id?: string };

const fmtDate = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

async function copyText(text: string, source: string, target?: string) {
  await navigator.clipboard.writeText(text);
  logCopy(source, text, { target });
}

/** 申込情報/明細(要望): 申込情報と従量・動力の電気情報をまとめて作成し、全体コピーする */
export function ApplicationSheetsPage() {
  const { data: rows, isLoading } = useQuery({ queryKey: ['application-sheets'], queryFn: () => api.get<SheetRow[]>('/application-sheets') });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1500);
  };

  const filtered = (rows ?? []).filter((r) => !q || JSON.stringify(r.data).includes(q) || (r.inputCode ?? '').includes(q));

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">申込情報/明細</h1>
          <button type="button" className="btn-primary" onClick={() => setDraft({ inputCode: null, hasJuryo: false, hasDoryoku: false, data: emptySheetData() })}>
            ＋ 新規作成
          </button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名義・番号などで検索" style={{ width: 260, maxWidth: '100%', marginBottom: 8 }} />

        <div className="m-card-list">
          {isLoading && <p style={{ padding: 16, fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
          {!isLoading && filtered.length === 0 && <p style={{ padding: 16, fontSize: 12, color: 'var(--color-text-faint)' }}>まだありません。「＋ 新規作成」から作れます。</p>}
          {filtered.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--color-sunken)', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 900 }}>{r.data.application?.name || '(名義未入力)'}</span>
                <span style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1, flexWrap: 'wrap' }}>
                  {r.inputCode && <span className="app-tag">{r.inputCode}</span>}
                  {r.hasJuryo && <span className="app-tag">従量</span>}
                  {r.hasDoryoku && <span className="app-tag">動力</span>}
                  <span>
                    {fmtDate(r.updatedAt)} {r.updatedByName ?? r.createdByName ?? ''}
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  copyText(sheetText(r), '申込情報(全体コピー)', r.data.application?.name)
                    .then(() => flash('全体をコピーしました'))
                    .catch(() => flash('コピーできませんでした'))
                }
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                全体コピー
              </button>
              <button type="button" onClick={() => setDraft({ ...r, data: { ...emptySheetData(), ...r.data } })} style={{ fontSize: 12, padding: '4px 10px' }}>
                編集
              </button>
            </div>
          ))}
        </div>
      </div>
      {draft && <SheetEditor initial={draft} onClose={() => setDraft(null)} onCopied={() => flash('全体をコピーしました')} />}
      {toast && <div className="chat-toast">{toast}</div>}
    </AppLayout>
  );
}

function SheetEditor({ initial, onClose, onCopied }: { initial: Draft; onClose: () => void; onCopied: () => void }) {
  const queryClient = useQueryClient();
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const isNew = !d.id;

  const setSection = (sec: keyof SheetData, patch: Section) => setD((cur) => ({ ...cur, data: { ...cur.data, [sec]: { ...cur.data[sec], ...patch } } }));

  const save = useMutation({
    mutationFn: async () => {
      const body = { inputCode: d.inputCode ?? '', hasJuryo: d.hasJuryo, hasDoryoku: d.hasDoryoku, data: d.data };
      return d.id ? api.patch<SheetRow>(`/application-sheets/${d.id}`, body) : api.post<SheetRow>('/application-sheets', body);
    },
    onSuccess: (row) => {
      setError(null);
      setD((cur) => ({ ...cur, id: row.id }));
      setSavedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
      queryClient.invalidateQueries({ queryKey: ['application-sheets'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '保存できませんでした'),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/application-sheets/${d.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application-sheets'] });
      onClose();
    },
  });

  // 申込情報 ⇔ 電気情報 の名義・フリガナ・住所を同じにする(要望のボタン)
  const sameAsElectric = (sec: 'juryo' | 'doryoku') => {
    const e = d.data[sec];
    setSection('application', { name: e.holder ?? '', nameKana: e.holderKana ?? '', address: e.address ?? '', addressZip: e.addressZip ?? '' });
  };
  const sameAsApplication = (sec: 'juryo' | 'doryoku') => {
    const a = d.data.application;
    setSection(sec, { holder: a.name ?? '', holderKana: a.nameKana ?? '', address: a.address ?? '', addressZip: a.addressZip ?? '' });
  };

  const electricTypes = [...(d.hasJuryo ? (['juryo'] as const) : []), ...(d.hasDoryoku ? (['doryoku'] as const) : [])];
  const typeLabel = { juryo: '従量', doryoku: '動力' } as const;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760, width: '100%', padding: 0, maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ margin: 0, fontSize: 15, flex: 1 }}>{isNew ? '申込情報を作成' : '申込情報を編集'}</h2>
          <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
            閉じる
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              投入コード
              <select value={d.inputCode ?? ''} onChange={(e) => setD({ ...d, inputCode: e.target.value || null })} style={{ fontSize: 13 }}>
                <option value="">選択</option>
                {INPUT_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              作成する電気情報
              <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13 }}>
                <input type="checkbox" checked={d.hasJuryo} onChange={(e) => setD({ ...d, hasJuryo: e.target.checked })} />
                従量
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13 }}>
                <input type="checkbox" checked={d.hasDoryoku} onChange={(e) => setD({ ...d, hasDoryoku: e.target.checked })} />
                動力
              </label>
            </span>
          </div>
          {!d.hasJuryo && !d.hasDoryoku && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-warning)' }}>従量・動力のどちらか(両方でも可)を選んでください。</p>}

          <SectionBox
            title="申込情報"
            actions={electricTypes.map((t) => (
              <button key={t} type="button" onClick={() => sameAsElectric(t)} style={{ fontSize: 11, padding: '2px 8px' }}>
                {typeLabel[t]}の電気情報と同一
              </button>
            ))}
          >
            <Fields fields={APPLICATION_FIELDS} values={d.data.application} onChange={(p) => setSection('application', p)} />
          </SectionBox>

          {electricTypes.map((t) => (
            <SectionBox
              key={t}
              title={`${typeLabel[t]}情報`}
              actions={
                <>
                  <BillPhotoButton onResult={(p) => setSection(t, p)} doryoku={t === 'doryoku'} />
                  <button type="button" onClick={() => sameAsApplication(t)} style={{ fontSize: 11, padding: '2px 8px' }}>
                    申込情報と同一
                  </button>
                </>
              }
            >
              <Fields fields={t === 'juryo' ? JURYO_FIELDS : DORYOKU_FIELDS} values={d.data[t]} onChange={(p) => setSection(t, p)} />
            </SectionBox>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
          {!isNew && (
            <button type="button" onClick={() => window.confirm('この申込情報を削除しますか？') && remove.mutate()} style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              削除
            </button>
          )}
          {error && <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</span>}
          {savedAt && !error && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{savedAt} に保存しました</span>}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            disabled={!d.hasJuryo && !d.hasDoryoku}
            onClick={() =>
              copyText(sheetText({ inputCode: d.inputCode, hasJuryo: d.hasJuryo, hasDoryoku: d.hasDoryoku, data: d.data }), '申込情報(全体コピー)', d.data.application?.name)
                .then(onCopied)
                .catch(() => setError('コピーできませんでした'))
            }
            style={{ fontSize: 12 }}
          >
            全体コピー
          </button>
          <button type="button" className="btn-primary" disabled={save.isPending || (!d.hasJuryo && !d.hasDoryoku)} onClick={() => save.mutate()} style={{ fontSize: 12 }}>
            {save.isPending ? '保存中...' : isNew ? '作成' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionBox({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ border: '1px solid var(--color-border)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--color-subtle)', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 13, flex: 1 }}>【{title}】</h3>
        {actions}
      </div>
      <div style={{ padding: '6px 10px' }}>{children}</div>
    </section>
  );
}

function Fields({ fields, values, onChange }: { fields: FieldDef[]; values: Section; onChange: (patch: Section) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', columnGap: 14 }}>
      {fields.map((f) => (
        <label key={f.key} style={{ display: 'grid', gridTemplateColumns: '128px minmax(0, 1fr)', alignItems: 'center', gap: 6, padding: '3px 0', fontWeight: 700 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{f.label}</span>
          <FieldInput f={f} values={values} onChange={onChange} />
        </label>
      ))}
    </div>
  );
}

function FieldInput({ f, values, onChange }: { f: FieldDef; values: Section; onChange: (patch: Section) => void }) {
  const v = values[f.key] ?? '';
  const set = (val: string) => onChange({ [f.key]: val });
  if (f.kind === 'select') {
    return (
      <select value={v} onChange={(e) => set(e.target.value)} style={{ fontSize: 13 }}>
        <option value="">選択</option>
        {f.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (f.kind === 'zipAddress') return <ZipAddress zip={values[`${f.key}Zip`] ?? ''} address={v} onChange={(zip, address) => onChange({ [`${f.key}Zip`]: zip, [f.key]: address })} />;
  const unit = f.kind === 'yen' ? '円' : f.kind === 'kwh' ? 'kwh' : f.kind === 'percent' ? '%' : null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input value={v} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} style={{ flex: 1, minWidth: 0, fontSize: 13 }} />
      {unit && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{unit}</span>}
    </span>
  );
}

/** 〒 + 住所。郵便番号を7桁入れると住所を自動表示(要望) */
function ZipAddress({ zip, address, onChange }: { zip: string; address: string; onChange: (zip: string, address: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const lastLooked = useRef('');

  const lookup = async (z: string, force = false) => {
    const digits = z.replace(/[^0-9０-９]/g, '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    if (digits.length !== 7 || (!force && lastLooked.current === digits)) return;
    lastLooked.current = digits;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.get<{ address: string | null }>(`/zip/${digits}`);
      if (!res.address) setMsg('該当する住所がありません');
      // 番地まで入力済みなら上書きしない(町名までの自動表示で消えないように)
      else if (!address || force || !address.startsWith(res.address)) onChange(z, address && address.startsWith(res.address) ? address : res.address);
    } catch {
      setMsg('住所を取得できませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        〒
        <input
          value={zip}
          onChange={(e) => {
            onChange(e.target.value, address);
            void lookup(e.target.value);
          }}
          inputMode="numeric"
          placeholder="123-4567"
          style={{ width: 100, fontSize: 13 }}
        />
        {busy && <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>検索中...</span>}
        {msg && <span style={{ fontSize: 10, color: 'var(--color-warning)' }}>{msg}</span>}
      </span>
      <input value={address} onChange={(e) => onChange(zip, e.target.value)} placeholder="住所(郵便番号から自動表示・番地を追記)" style={{ fontSize: 13 }} />
    </span>
  );
}

/** 明細の写真を読み取って電気情報へ反映する(端末内OCR・無料) */
function BillPhotoButton({ onResult, doryoku }: { onResult: (patch: Section) => void; doryoku: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<string | null>(null);

  const run = async (file: File | undefined) => {
    if (!file) return;
    setState('読み取り準備中...');
    try {
      const text = await recognizeBill(file, (p, status) =>
        setState(status === 'recognizing text' ? `読み取り中 ${Math.round(p * 100)}%` : status.includes('traineddata') ? '日本語データ読込中(初回のみ)' : '読み取り準備中...'),
      );
      const fields = Object.fromEntries(extractBillFields(text).map((f) => [f.label, f.value]));
      const patch: Section = {};
      const put = (key: string, v: string | undefined) => {
        if (v) patch[key] = v;
      };
      put('company', fields['契約電力会社']);
      put('spid', fields['供給地点特定番号']);
      put('customerNo', fields['お客さま番号']);
      put('capacity', fields['契約容量・電力']);
      put('charge', fields['請求金額']?.replace(/\s*円$/, ''));
      put('usage', fields['使用量']?.replace(/\s*kWh$/i, ''));
      put('billMonth', fields['明細月']);
      put('addressZip', fields['郵便番号']);
      put('address', fields['住所']);
      if (doryoku) {
        put('period', fields['使用期間']);
        put('powerFactor', fields['力率']?.replace(/%$/, ''));
      }
      onResult(patch);
      const n = Object.keys(patch).length;
      setState(n ? `${n}項目を反映しました(写真と見比べてください)` : '項目を読み取れませんでした。明るく正面から撮り直してください');
    } catch (e) {
      setState(e instanceof Error ? e.message : '読み取りに失敗しました');
    } finally {
      if (ref.current) ref.current.value = '';
      window.setTimeout(() => setState(null), 6000);
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {state && <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>{state}</span>}
      <button type="button" onClick={() => ref.current?.click()} style={{ fontSize: 11, padding: '2px 8px' }}>
        明細写真から読み取り
      </button>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void run(e.target.files?.[0])} />
    </span>
  );
}
