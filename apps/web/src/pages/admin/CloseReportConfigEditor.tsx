import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useIsPhone } from '../../lib/useIsPhone';
import { CloseReportConfig, DEFAULT_CONFIG, FIELD_DEFS, FeeRule, SECTION_ORDER } from '../../lib/closeReport';
import { useCloseReportConfig } from '../close-reports/CloseReportPage';

/** 選択肢を持つ項目(ユーザー・管理費・テキスト系は選択肢なし) */
const HAS_OPTIONS = new Set(['choice', 'sites']);

/**
 * マスタ管理「クローズ報告」(要望: 全ての項目をマスタで変更できる)。
 * 見出し・項目名・選択肢・契約内容を入力する結果・管理費の範囲を変えられる。変更は「保存」でフォームと報告テキストに反映。
 */
export function CloseReportConfigEditor() {
  const isPhone = useIsPhone();
  const queryClient = useQueryClient();
  const { data: saved } = useCloseReportConfig();
  const [cfg, setCfg] = useState<CloseReportConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (saved && !dirty) setCfg(saved);
  }, [saved, dirty]);

  const save = useMutation({
    mutationFn: (value: CloseReportConfig) => api.put('/close-reports/config', { value }),
    onSuccess: () => {
      setDirty(false);
      setMsg({ ok: true, text: '保存しました。フォームと報告テキストに反映されます' });
      queryClient.invalidateQueries({ queryKey: ['close-report-config'] });
    },
    onError: (e) => setMsg({ ok: false, text: e instanceof ApiError ? e.message : '保存に失敗しました' }),
  });

  if (!cfg) return <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>;

  const update = (fn: (c: CloseReportConfig) => CloseReportConfig) => {
    setCfg((c) => (c ? fn(c) : c));
    setDirty(true);
    setMsg(null);
  };
  const setField = (key: string, patch: Partial<CloseReportConfig['fields'][string]>) =>
    update((c) => ({ ...c, fields: { ...c.fields, [key]: { ...c.fields[key], ...patch } } }));
  const setFee = (i: number, patch: Partial<FeeRule>) => update((c) => ({ ...c, feeRules: c.feeRules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const input: React.CSSProperties = { padding: isPhone ? '9px 11px' : '5px 8px', fontSize: isPhone ? 14 : 12, borderRadius: 8 };
  const card: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    boxShadow: 'var(--shadow-sm)',
    padding: isPhone ? 16 : 14,
    marginBottom: 14,
  };
  const resultOptions = cfg.fields.result?.options ?? [];

  return (
    <div style={{ maxWidth: 760, paddingBottom: 80 }}>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
        クローズ報告のフォームと報告テキストの項目を変更できます。変更後は一番下の「保存」を押してください。
      </p>

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>全体</div>
        <Row label="報告テキストの題名(【】の中)" isPhone={isPhone}>
          <input value={cfg.title} onChange={(e) => update((c) => ({ ...c, title: e.target.value }))} style={{ ...input, width: '100%' }} />
        </Row>
        <Row label="クローズ結果の最大件数" isPhone={isPhone}>
          <input
            key={`max-${cfg.maxResults}`}
            inputMode="numeric"
            defaultValue={cfg.maxResults}
            onBlur={(e) => update((c) => ({ ...c, maxResults: Math.min(10, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1)) }))}
            style={{ ...input, width: 80 }}
          />
        </Row>
        <Row label="契約内容(獲得プラン〜紙明細)を入力するクローズ結果" isPhone={isPhone}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {resultOptions.map((o) => {
              const on = cfg.contractResults.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  className={on ? 'btn-primary' : undefined}
                  onClick={() => update((c) => ({ ...c, contractResults: on ? c.contractResults.filter((x) => x !== o) : [...c.contractResults, o] }))}
                  style={{ padding: isPhone ? '7px 12px' : '3px 10px', borderRadius: 16 }}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </Row>
        {/* 数値は入力し終えてから反映する(0.5 の「.」を打てるように) */}
        <Row label="相対/供給管理費の選択肢(獲得プラン名に含まれる文字ごと。上から順に判定)" isPhone={isPhone}>
          {cfg.feeRules.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <input value={r.match} placeholder="例: マーケットリンク" onChange={(e) => setFee(i, { match: e.target.value })} style={{ ...input, flex: '1 1 140px', minWidth: 0 }} />
              <input key={`min-${i}-${r.min}`} inputMode="decimal" defaultValue={r.min} onBlur={(e) => setFee(i, { min: Number(e.target.value) || 0 })} style={{ ...input, width: 64 }} />
              <span style={{ fontSize: 12 }}>〜</span>
              <input key={`max-${i}-${r.max}`} inputMode="decimal" defaultValue={r.max} onBlur={(e) => setFee(i, { max: Number(e.target.value) || 0 })} style={{ ...input, width: 64 }} />
              <span style={{ fontSize: 12 }}>刻み</span>
              <input key={`step-${i}-${r.step}`} inputMode="decimal" defaultValue={r.step} onBlur={(e) => setFee(i, { step: Number(e.target.value) || 0 })} style={{ ...input, width: 60 }} />
              <input value={r.unit} placeholder="単位" onChange={(e) => setFee(i, { unit: e.target.value })} style={{ ...input, width: 54 }} />
              <button type="button" onClick={() => update((c) => ({ ...c, feeRules: c.feeRules.filter((_, j) => j !== i) }))} style={{ color: 'var(--color-danger)' }}>
                削除
              </button>
            </div>
          ))}
          <button type="button" onClick={() => update((c) => ({ ...c, feeRules: [...c.feeRules, { match: '', min: 0, max: 10, step: 1, unit: '円' }] }))}>
            ＋ ルールを追加
          </button>
        </Row>
      </div>

      {SECTION_ORDER.map((sec) => (
        <div key={sec} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>見出し</span>
            <input
              value={cfg.sections[sec]}
              onChange={(e) => update((c) => ({ ...c, sections: { ...c.sections, [sec]: e.target.value } }))}
              style={{ ...input, flex: 1, minWidth: 0, fontWeight: 800 }}
            />
          </div>
          {FIELD_DEFS.filter((d) => d.section === sec).map((def) => {
            const f = cfg.fields[def.key];
            return (
              <div key={def.key} style={{ borderTop: '1px solid var(--color-sunken)', padding: isPhone ? '14px 0' : '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input value={f.label} onChange={(e) => setField(def.key, { label: e.target.value })} style={{ ...input, flex: 1, minWidth: 0, fontWeight: 700 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 4 }}>{kindNote(def.kind, def.key)}</div>
                {HAS_OPTIONS.has(def.kind) && <OptionsEditor options={f.options} onChange={(options) => setField(def.key, { options })} isPhone={isPhone} input={input} />}
              </div>
            );
          })}
        </div>
      ))}

      <div
        style={{
          position: 'sticky',
          bottom: isPhone ? 'calc(72px + env(safe-area-inset-bottom))' : 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-md)',
          padding: '10px 12px',
        }}
      >
        <span style={{ flex: 1, fontSize: 12, color: msg ? (msg.ok ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-text-muted)' }}>
          {msg?.text ?? (dirty ? '未保存の変更があります' : '変更はありません')}
        </span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('すべての項目を初期の状態に戻しますか？(保存するまで反映されません)')) update(() => DEFAULT_CONFIG);
          }}
        >
          初期値に戻す
        </button>
        <button className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate(cfg)} style={{ padding: isPhone ? '9px 22px' : undefined }}>
          {save.isPending ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}

function kindNote(kind: string, key: string) {
  if (kind === 'user') return 'システムのユーザーから選択';
  if (kind === 'fee') return '獲得プランに合わせて自動で選択肢を作る(上の「全体」で設定)';
  if (kind === 'sites') return '拠点数 + 結果。下の選択肢が「結果」になります';
  if (kind === 'settleDate') return '日付、または「無し」';
  if (kind === 'date') return '日付';
  if (kind === 'number') return '数字';
  if (kind === 'textarea') return '自由記述(複数行)';
  if (key === 'cbAmount') return '他社解約金補填・CBで2番目の選択肢(振込)を選んだときだけ表示';
  if (kind === 'choice') return '選択肢が7個以下で短ければボタン、それ以外はプルダウン。空ならテキスト入力';
  return 'テキスト入力';
}

function Row({ label, isPhone, children }: { label: string; isPhone: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: isPhone ? 16 : 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

/** 選択肢の追加・削除(×)・並び替え(まとめて編集で1行1つ) */
function OptionsEditor({ options, onChange, isPhone, input }: { options: string[]; onChange: (o: string[]) => void; isPhone: boolean; input: React.CSSProperties }) {
  const [adding, setAdding] = useState('');
  const [bulk, setBulk] = useState<string | null>(null);
  const add = (raw: string) => {
    const items = raw
      .split(/[\r\n\t]+/)
      .map((s) => s.trim())
      .filter((s) => s && !options.includes(s));
    if (items.length) onChange([...options, ...items]);
    setAdding('');
  };
  if (bulk !== null) {
    return (
      <div style={{ marginTop: 8 }}>
        <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={Math.min(12, Math.max(4, options.length + 1))} style={{ ...input, width: '100%', lineHeight: 1.6 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <span style={{ flex: 1, fontSize: 11, color: 'var(--color-text-faint)' }}>1行に1つ。上からの順に並びます</span>
          <button type="button" onClick={() => setBulk(null)}>
            やめる
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onChange([...new Set(bulk.split('\n').map((s) => s.trim()).filter(Boolean))]);
              setBulk(null);
            }}
          >
            反映
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => (
          <span
            key={o}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: isPhone ? '5px 6px 5px 11px' : '2px 4px 2px 9px',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 16,
              fontSize: isPhone ? 13 : 12,
              background: 'var(--color-surface)',
            }}
          >
            {o}
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onChange(options.filter((x) => x !== o))}
              title="削除"
              style={{ padding: '0 5px', fontSize: 13, color: 'var(--color-text-faint)' }}
            >
              ×
            </button>
          </span>
        ))}
        {options.length === 0 && <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>選択肢なし(テキスト入力になります)</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          value={adding}
          placeholder="選択肢を追加(複数行の貼り付け可)"
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && adding.trim()) add(adding);
          }}
          onPaste={(e) => {
            const raw = e.clipboardData.getData('text');
            if (/[\r\n\t]/.test(raw)) {
              e.preventDefault();
              add(raw);
            }
          }}
          style={{ ...input, flex: 1, minWidth: 0 }}
        />
        <button type="button" disabled={!adding.trim()} onClick={() => add(adding)}>
          追加
        </button>
        <button type="button" onClick={() => setBulk(options.join('\n'))} title="1行1つで並び替え・まとめて編集">
          並び替え
        </button>
      </div>
    </div>
  );
}
