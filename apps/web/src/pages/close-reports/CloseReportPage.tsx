import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useMe, useUserOptions } from '../../hooks/useApi';
import { useIsPhone } from '../../lib/useIsPhone';
import { api, ApiError } from '../../lib/api';
import { logCopy } from '../../lib/copyLog';
import {
  CloseReportConfig,
  CloseValues,
  FIELD_DEFS,
  FieldDef,
  SECTION_ORDER,
  SectionKey,
  buildText,
  circled,
  emptyValues,
  feeOptions,
  isVisible,
  mergeConfig,
} from '../../lib/closeReport';

interface SavedReport {
  id: string;
  storeName: string;
  values: CloseValues;
  text: string;
  createdAt: string;
  updatedAt: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const fmt = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function useCloseReportConfig() {
  return useQuery({
    queryKey: ['close-report-config'],
    queryFn: () => api.get<{ value: unknown }>('/close-reports/config'),
    select: (r) => mergeConfig(r.value),
  });
}

/**
 * クローズ報告(要望: 商談後のクローズ結果を報告し、決まった書式の文章をコピーする)。
 * 主にスマホで使うため、選択肢の少ない項目はタップで選べるボタンにし、作成ボタンを画面下に固定する。
 * 入力途中の内容は端末に下書きとして残す。作成した報告は本人の履歴に保存する。
 */
export function CloseReportPage() {
  const isPhone = useIsPhone();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { data: config } = useCloseReportConfig();
  const { data: users } = useUserOptions();
  const userNames = useMemo(() => (users ?? []).map((u) => u.name), [users]);
  const draftKey = me ? `closeReport.draft:${me.id}` : null;

  const [values, setValues] = useState<CloseValues>(() => ({ ...emptyValues(), visitDate: today() }));
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  const flash = (m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  };

  // 下書きの読み込み(無ければクローザーは自分)
  useEffect(() => {
    if (!draftKey || loaded) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as { values: CloseValues; savedId: string | null };
        if (d?.values?.results) {
          setValues(d.values);
          setSavedId(d.savedId ?? null);
        }
      } else if (me) {
        setValues((v) => ({ ...v, closer: me.name }));
      }
    } catch {
      // 下書きが読めなくても入力はできる
    }
    setLoaded(true);
  }, [draftKey, loaded, me]);

  // 入力のたびに端末へ下書きを残す
  useEffect(() => {
    if (!draftKey || !loaded) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ values, savedId }));
    } catch {
      // 保存できない端末(プライベートモード等)では下書きなし
    }
  }, [draftKey, loaded, values, savedId]);

  const text = useMemo(() => (config ? buildText(config, values, (n) => n) : ''), [config, values]);

  const setTop = (key: string, v: string) => setValues((cur) => ({ ...cur, [key]: v }));
  const setResult = (i: number, key: string, v: string) =>
    setValues((cur) => ({ ...cur, results: cur.results.map((r, j) => (j === i ? { ...r, [key]: v } : r)) }));

  const save = useMutation({
    mutationFn: () => {
      const body = { values, text, storeName: str(values.storeName) };
      return savedId ? api.patch<SavedReport>(`/close-reports/${savedId}`, body) : api.post<SavedReport>('/close-reports', body);
    },
    onSuccess: (r) => {
      setSavedId(r.id);
      queryClient.invalidateQueries({ queryKey: ['close-reports'] });
    },
  });

  const copyText = async (t: string, target: string) => {
    try {
      await navigator.clipboard.writeText(t);
      logCopy('クローズ報告', t, { target });
      return true;
    } catch {
      flash('コピーできませんでした');
      return false;
    }
  };

  // 必須項目は設けない(要望: 未入力があってもそのまま作成・コピーできる)
  const openSheet = () => setSheetOpen(true);

  const copyAndSave = async () => {
    if (await copyText(text, str(values.storeName))) flash('コピーしました');
    save.mutate(undefined, {
      onSuccess: () => flash('コピーして保存しました'),
      onError: (e) => flash(e instanceof ApiError ? e.message : '保存に失敗しました(コピーはできています)'),
    });
  };

  const startNew = () => {
    if (!window.confirm('入力内容を消して新しい報告を始めますか？')) return;
    setValues({ ...emptyValues(), visitDate: today(), ...(me ? { closer: me.name } : {}) });
    setSavedId(null);
    setSheetOpen(false);
    window.scrollTo({ top: 0 });
  };

  if (!config) {
    return (
      <AppLayout>
        <div className="page">読み込み中...</div>
      </AppLayout>
    );
  }

  const ctx: FieldCtx = { config, isPhone, userNames };
  const sectionDefs = (sec: SectionKey) => FIELD_DEFS.filter((d) => d.section === sec);

  const form = (
    <>
      {SECTION_ORDER.map((sec) =>
        sec === 'result' ? (
          <Card key={sec} title={config.sections.result} isPhone={isPhone}>
            {values.results.map((r, i) => {
              const contract = config.contractResults.includes(str(r.result));
              return (
                <div
                  key={i}
                  style={{
                    border: `1px solid ${contract ? 'var(--color-primary-border)' : 'var(--color-border)'}`,
                    background: contract ? 'var(--color-primary-soft)' : 'var(--color-subtle)',
                    borderRadius: 10,
                    padding: isPhone ? 14 : 12,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, fontSize: 13, fontWeight: 800, color: 'var(--color-primary)' }}>
                    {config.sections.result} {circled(i)}
                    {values.results.length > 1 && (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setValues((cur) => ({ ...cur, results: cur.results.filter((_, j) => j !== i) }))}
                        style={{ marginLeft: 'auto', color: 'var(--color-danger)', fontSize: 12 }}
                      >
                        削除
                      </button>
                    )}
                  </div>
                  {sectionDefs('result').map((def) =>
                    isVisible(config, def, r) ? (
                      <div key={def.key} style={def.contract ? { borderLeft: '2px solid var(--color-primary-border)', paddingLeft: 12 } : undefined}>
                        <Field ctx={ctx} def={def} scope={r} onChange={(k, v) => setResult(i, k, v)} />
                      </div>
                    ) : null,
                  )}
                </div>
              );
            })}
            {values.results.length < config.maxResults && (
              <button
                type="button"
                onClick={() => setValues((cur) => ({ ...cur, results: [...cur.results, {}] }))}
                style={{ width: '100%', padding: isPhone ? '11px 0' : '8px 0', fontSize: 13, color: 'var(--color-primary)', borderStyle: 'dashed' }}
              >
                ＋ {config.sections.result}を追加(最大{config.maxResults}件)
              </button>
            )}
          </Card>
        ) : (
          <Card key={sec} title={config.sections[sec]} isPhone={isPhone}>
            {sectionDefs(sec).map((def) =>
              isVisible(config, def, values) ? <Field key={def.key} ctx={ctx} def={def} scope={values} onChange={setTop} /> : null,
            )}
          </Card>
        ),
      )}
    </>
  );

  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: isPhone ? undefined : 1080, padding: isPhone ? '16px 16px 150px' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <h1 className="page-title" style={{ flex: 1, fontSize: isPhone ? 17 : undefined }}>
            クローズ報告
          </h1>
          {savedId && <span style={{ fontSize: 11, color: 'var(--color-success)' }}>保存済み(直すと上書き)</span>}
          <button onClick={() => setHistoryOpen(true)} style={{ padding: isPhone ? '7px 12px' : undefined }}>
            報告履歴
          </button>
        </div>

        {isPhone ? (
          form
        ) : (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0, maxWidth: 600 }}>
              {form}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={startNew}>新しい報告を始める</button>
              </div>
            </div>
            {/* PC は右に完成テキストを常に表示する */}
            <div style={{ width: 400, flexShrink: 0, position: 'sticky', top: 12 }}>
              <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, boxShadow: 'var(--shadow-sm)', padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <b style={{ flex: 1, fontSize: 13 }}>報告テキスト</b>
                  <button className="btn-primary" disabled={save.isPending} onClick={() => void copyAndSave()}>
                    コピーして保存
                  </button>
                </div>
                <pre style={preStyle(false)}>{text}</pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {isPhone && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 'calc(64px + env(safe-area-inset-bottom))',
            zIndex: 250,
            background: 'var(--color-surface)',
            borderTop: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-md)',
            padding: '10px 16px',
          }}
        >
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={startNew} style={{ flex: 1, padding: '11px 0', fontSize: 13 }}>
              新しく始める
            </button>
            <button className="btn-primary" onClick={openSheet} style={{ flex: 2, padding: '11px 0', fontSize: 14 }}>
              報告テキストを作成
            </button>
          </div>
        </div>
      )}

      {sheetOpen && (
        <div className="modal-backdrop" onClick={() => setSheetOpen(false)} style={isPhone ? { alignItems: 'flex-end', padding: 0 } : undefined}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: isPhone ? '100%' : 'min(560px, 96vw)',
              maxWidth: isPhone ? 'none' : 560,
              padding: isPhone ? '18px 18px calc(22px + env(safe-area-inset-bottom))' : '18px 20px',
              borderRadius: isPhone ? '18px 18px 0 0' : undefined,
              maxHeight: isPhone ? '92vh' : 'calc(100vh - 48px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
              <b style={{ flex: 1, fontSize: 16 }}>報告テキスト</b>
              <button onClick={() => setSheetOpen(false)}>閉じる</button>
            </div>
            <pre style={{ ...preStyle(isPhone), marginTop: 14, overflow: 'auto', flex: 1 }}>{text}</pre>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setSheetOpen(false)} style={{ flex: 1, padding: '11px 0', fontSize: 13 }}>
                内容を直す
              </button>
              <button className="btn-primary" disabled={save.isPending} onClick={copyAndSave} style={{ flex: 2, padding: '11px 0', fontSize: 14 }}>
                {save.isPending ? '保存中...' : savedId ? 'コピーして上書き保存' : 'コピーして保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <HistoryModal
          isPhone={isPhone}
          onClose={() => setHistoryOpen(false)}
          onCopy={async (r) => {
            if (await copyText(r.text, r.storeName)) flash('コピーしました');
          }}
          onEdit={(r) => {
            if (!window.confirm('今の入力内容をこの報告に置き換えて直しますか？')) return;
            setValues(r.values?.results ? r.values : { ...emptyValues(), ...r.values });
            setSavedId(r.id);
            setHistoryOpen(false);
            window.scrollTo({ top: 0 });
          }}
          onDeleted={(id) => {
            if (id === savedId) setSavedId(null);
          }}
        />
      )}

      {toast && (
        <div
          className="popover"
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: isPhone ? 'calc(150px + env(safe-area-inset-bottom))' : 24,
            zIndex: 2600,
            padding: '8px 16px',
            fontSize: 13,
            background: 'var(--color-text)',
            color: 'var(--color-surface)',
          }}
        >
          {toast}
        </div>
      )}
    </AppLayout>
  );
}

const preStyle = (isPhone: boolean): React.CSSProperties => ({
  margin: 0,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: 'inherit',
  fontSize: isPhone ? 13.5 : 12.5,
  lineHeight: 1.75,
  background: 'var(--color-subtle)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: isPhone ? '14px 16px' : '12px 14px',
});

function Card({ title, isPhone, children }: { title: string; isPhone: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: isPhone ? 12 : 10,
        boxShadow: 'var(--shadow-sm)',
        padding: isPhone ? 16 : 14,
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, margin: '0 0 14px', paddingLeft: 9, borderLeft: '3px solid var(--color-primary)' }}>{title}</div>
      {children}
    </div>
  );
}

interface FieldCtx {
  config: CloseReportConfig;
  isPhone: boolean;
  userNames: string[];
}

/** 1項目(項目名・入力欄) */
function Field({ ctx, def, scope, onChange }: { ctx: FieldCtx; def: FieldDef; scope: Record<string, unknown>; onChange: (key: string, v: string) => void }) {
  const { config, isPhone } = ctx;
  const conf = config.fields[def.key];
  const value = str(scope[def.key]);
  const input: React.CSSProperties = {
    width: '100%',
    padding: isPhone ? '10px 12px' : '7px 10px',
    fontSize: isPhone ? 14 : 13,
    borderRadius: 8,
  };
  const label = def.kind === 'sites' ? `${conf.label}(拠点数/結果)` : conf.label;

  let control: React.ReactNode;
  if (def.kind === 'choice' || def.kind === 'user' || def.kind === 'fee') {
    const options =
      def.kind === 'user' ? ctx.userNames : def.kind === 'fee' ? (feeOptions(config, str(scope.plan)) ?? []) : conf.options;
    control =
      def.kind === 'choice' && options.length === 0 ? (
        <input value={value} onChange={(e) => onChange(def.key, e.target.value)} style={input} />
      ) : (
        <Choice options={options} value={value} onChange={(v) => onChange(def.key, v)} isPhone={isPhone} forceSelect={def.kind !== 'choice'} input={input} />
      );
  } else if (def.kind === 'date') {
    control = <input type="date" className="date-input" value={value} onChange={(e) => onChange(def.key, e.target.value)} style={input} />;
  } else if (def.kind === 'number') {
    control = <input inputMode="numeric" value={value} onChange={(e) => onChange(def.key, e.target.value.replace(/[^\d.]/g, ''))} style={input} />;
  } else if (def.kind === 'textarea') {
    control = <textarea value={value} onChange={(e) => onChange(def.key, e.target.value)} rows={3} style={{ ...input, lineHeight: 1.6 }} />;
  } else if (def.kind === 'sites') {
    const count = str(scope[`${def.key}Count`]);
    const zero = Number(count || '0') === 0;
    control = (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          inputMode="numeric"
          value={count}
          onChange={(e) => {
            const n = e.target.value.replace(/[^\d]/g, '');
            onChange(`${def.key}Count`, n);
            if (Number(n || '0') === 0) onChange(`${def.key}Result`, '');
          }}
          style={{ ...input, width: 72, flexShrink: 0, textAlign: 'center' }}
        />
        <span style={{ fontSize: 12, flexShrink: 0 }}>拠点</span>
        <select
          value={str(scope[`${def.key}Result`])}
          disabled={zero}
          onChange={(e) => onChange(`${def.key}Result`, e.target.value)}
          style={{ ...input, flex: 1, minWidth: 0 }}
        >
          <option value="">{zero ? '0拠点のときは不要' : '結果を選択'}</option>
          {conf.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  } else if (def.kind === 'settleDate') {
    const none = !!str(scope.settleNone);
    control = (
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="date"
          className="date-input"
          value={value}
          onChange={(e) => {
            onChange(def.key, e.target.value);
            if (e.target.value) onChange('settleNone', '');
          }}
          style={{ ...input, flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          onClick={() => {
            onChange('settleNone', none ? '' : '1');
            if (!none) onChange(def.key, '');
          }}
          className={none ? 'btn-primary' : undefined}
          style={{ flexShrink: 0, padding: isPhone ? '0 16px' : '0 12px', fontSize: 13 }}
        >
          無し
        </button>
      </div>
    );
  } else {
    control = <input value={value} onChange={(e) => onChange(def.key, e.target.value)} style={input} />;
  }

  return (
    <div style={{ marginBottom: isPhone ? 16 : 12 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
        {label}
      </label>
      {control}
    </div>
  );
}

/** 選択肢が少なく短ければタップで選べるボタン、多ければプルダウン(要望: スマホで操作しやすく) */
function Choice({
  options,
  value,
  onChange,
  isPhone,
  forceSelect,
  input,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  isPhone: boolean;
  forceSelect: boolean;
  input: React.CSSProperties;
}) {
  const asButtons = !forceSelect && options.length <= 7 && options.every((o) => o.length <= 6);
  if (!asButtons) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={input}>
        <option value="">選択してください</option>
        {/* 設定で消した選択肢が入っていても表示は残す */}
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            type="button"
            className={on ? 'btn-primary' : undefined}
            onClick={() => onChange(on ? '' : o)}
            style={{ flex: '1 0 auto', minWidth: 64, padding: isPhone ? '9px 10px' : '6px 10px', fontSize: 13, fontWeight: on ? 700 : 500, borderRadius: 8 }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** 自分の報告履歴(コピー・直す・削除) */
function HistoryModal({
  isPhone,
  onClose,
  onCopy,
  onEdit,
  onDeleted,
}: {
  isPhone: boolean;
  onClose: () => void;
  onCopy: (r: SavedReport) => void;
  onEdit: (r: SavedReport) => void;
  onDeleted: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['close-reports'], queryFn: () => api.get<SavedReport[]>('/close-reports') });
  const [openId, setOpenId] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/close-reports/${id}`),
    onSuccess: (_r, id) => {
      onDeleted(id);
      queryClient.invalidateQueries({ queryKey: ['close-reports'] });
    },
  });
  return (
    <div className="modal-backdrop" onClick={onClose} style={isPhone ? { alignItems: 'flex-end', padding: 0 } : undefined}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isPhone ? '100%' : 'min(560px, 96vw)',
          maxWidth: isPhone ? 'none' : 560,
          padding: isPhone ? '18px 18px calc(22px + env(safe-area-inset-bottom))' : '18px 20px',
          borderRadius: isPhone ? '18px 18px 0 0' : undefined,
          maxHeight: isPhone ? '92vh' : 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
          <b style={{ flex: 1, fontSize: 16 }}>報告履歴</b>
          <button onClick={onClose}>閉じる</button>
        </div>
        <div style={{ overflow: 'auto', flex: 1, marginTop: 8 }}>
          {isLoading && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
          {data?.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>まだ報告がありません</p>}
          {data?.map((r) => {
            const open = openId === r.id;
            const firstResult = str(r.values?.results?.[0]?.result);
            return (
              <div key={r.id} style={{ borderBottom: '1px solid var(--color-sunken)', padding: '12px 0' }}>
                <div onClick={() => setOpenId(open ? null : r.id)} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <b style={{ fontSize: 14, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.storeName || '(店舗名なし)'}</b>
                    {firstResult && <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>{firstResult}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 3 }}>
                    作成 {fmt(r.createdAt)}
                    {r.updatedAt !== r.createdAt ? ` ・ 更新 ${fmt(r.updatedAt)}` : ''}
                  </div>
                </div>
                {open && <pre style={{ ...preStyle(isPhone), marginTop: 10, maxHeight: 280, overflow: 'auto' }}>{r.text}</pre>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn-primary" onClick={() => onCopy(r)} style={{ flex: 1, padding: isPhone ? '8px 0' : undefined }}>
                    コピー
                  </button>
                  <button onClick={() => onEdit(r)} style={{ flex: 1, padding: isPhone ? '8px 0' : undefined }}>
                    直す
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`「${r.storeName || '(店舗名なし)'}」の報告を削除しますか？`)) remove.mutate(r.id);
                    }}
                    style={{ padding: isPhone ? '8px 14px' : undefined, color: 'var(--color-danger)' }}
                  >
                    削除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
