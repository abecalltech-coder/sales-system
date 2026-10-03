import { ReactNode, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useProducts, useSources, useSystemSettings, useMasterOrder, useDealFields, DealFieldItem, useMasterShare } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { MASTER_TAB_GROUPS, orderedCategories } from '../../lib/masterTabs';
import { applySavedOrder } from '../../lib/rowColors';

// 内部コードに意味を持たせず単純な選択肢名の管理として使うカテゴリでは、追加フォームで
// 表示名のみ入力させ内部コードは自動採番する。ただし以下は内部コード自体が判定キーとして
// 使われるため対象外(基本ステータス=自動化コード、部署=自動化コード、フック変換=変換元テキスト)。
const NON_SIMPLE_LABEL_CATEGORIES = new Set(['TOSS', 'APPOINTMENT', 'VISIT', 'MATCHING', 'DEPARTMENT_BRANCH', 'TOSS_HOOK_LABEL_MAP']);
const ALL_CATEGORY_VALUES = new Set(MASTER_TAB_GROUPS.flatMap((g) => g.categories.map((c) => c.value)));
const SIMPLE_LABEL_CATEGORIES = new Set([...ALL_CATEGORY_VALUES].filter((v) => !NON_SIMPLE_LABEL_CATEGORIES.has(v)));
/** 行の色に使わない項目(部署はCLカレンダーの色、フック変換は変換表) */
const NO_ROW_COLOR_CATEGORIES = new Set(['DEPARTMENT_BRANCH', 'TOSS_HOOK_LABEL_MAP', 'VISIT']);

interface StatusRow {
  id: string;
  category: string;
  internalCode: string;
  displayName: string;
  color: string | null;
  textColor?: string | null;
  onlineColor?: string | null;
  order: number;
  active: boolean;
}

/** 共通のオン/オフを切り替えられる項目(API master-share.ts と揃える) */
const SPLITTABLE = new Set(['MEETING_FORMAT', 'TOSS_PRE_CONFIRM', 'INDUSTRY', 'EXISTING_CONTRACT', 'PROPOSAL_LOCATION']);
/** 共通だが切り替えられない項目とその理由 */
const FIXED_SHARED_REASON: Record<string, string> = {
  DEPARTMENT_BRANCH: '部署は月次サマリーの部署別シートやCLカレンダーの色にも使うため、常に共通です',
  APPOINTMENT_CLOSER: 'アポ実績とCLカレンダーは同じデータを表示しているため、常に共通です',
};

const DEALS_TAB = '案件管理';
// カテゴリ一覧以外の特殊タブ(案件管理のプルダウン、商材・流入元の閲覧、自動作成テンプレートの編集)
const EXTRA_TAB_TITLES = [DEALS_TAB, '商材・流入元', 'アポ詳細FMT'];

/** マスタ管理での項目(カード)の並び順を保存する(=一覧の行の色の優先順) */
function useSaveCardOrder() {
  const queryClient = useQueryClient();
  const { data: saved } = useMasterOrder();
  return useMutation({
    mutationFn: (v: { tab: string; keys: string[] }) =>
      api.put('/system-settings/masterCardOrder', { value: { ...(saved ?? {}), [v.tab]: v.keys } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-settings'] }),
  });
}

function swap<T>(list: T[], i: number, j: number): T[] {
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function MastersAdminPage() {
  const [tabIndex, setTabIndex] = useState(0);
  const allTitles = [...MASTER_TAB_GROUPS.map((g) => g.title), ...EXTRA_TAB_TITLES];
  const { data: savedOrder } = useMasterOrder();
  const saveOrder = useSaveCardOrder();
  const currentTitle = allTitles[tabIndex];
  const cards = tabIndex < MASTER_TAB_GROUPS.length ? orderedCategories(currentTitle, savedOrder) : [];
  const { data: share } = useMasterShare();
  const shareOff = new Set(share?.off ?? []);
  const queryClient = useQueryClient();
  const [shareError, setShareError] = useState<string | null>(null);
  const shareMutation = useMutation({
    mutationFn: (v: { category: string; shared: boolean }) => api.put(`/status-master/share/${v.category}`, { shared: v.shared }),
    onSuccess: () => {
      setShareError(null);
      queryClient.invalidateQueries({ queryKey: ['status-master'] });
      queryClient.invalidateQueries({ queryKey: ['statuses'] });
    },
    onError: (err) => setShareError(err instanceof ApiError ? err.message : '共通の切り替えに失敗しました'),
  });
  const toggleShare = (category: string, label: string, shared: boolean) => {
    const msg = shared
      ? `「${label}」を共通に戻します。アポ実績の選択肢はトス実績の同じ名前の選択肢にまとめられ、トス側に無いものは追加されます。よろしいですか？`
      : `「${label}」の共通をオフにします。アポ実績(CLカレンダー含む)は現在の選択肢をコピーした独立のリストになり、以後トス実績とは別々に編集できます。よろしいですか？`;
    if (window.confirm(msg)) shareMutation.mutate({ category, shared });
  };
  // 共通オフの項目は、アポ実績/CLカレンダーのタブではアポ用(独立)の選択肢を編集する
  const effectiveCategory = (c: string) => (currentTitle !== 'トス実績' && shareOff.has(c) ? `${c}@APPOINTMENT` : c);

  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 1000 }}>
        <h1 className="page-title" style={{ marginBottom: 10 }}>マスタ管理</h1>

        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
          {allTitles.map((title, i) => (
            <button
              key={title}
              onClick={() => setTabIndex(i)}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: tabIndex === i ? 700 : 500,
                border: 'none',
                borderBottom: tabIndex === i ? '2px solid var(--color-primary)' : '2px solid transparent',
                background: 'transparent',
                color: tabIndex === i ? 'var(--color-primary)' : 'var(--color-text)',
                cursor: 'pointer',
              }}
            >
              {title}
            </button>
          ))}
        </div>

        {tabIndex < MASTER_TAB_GROUPS.length && (
          <>
            <ColorHelp />
            {shareError && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 8 }}>{shareError}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {cards.map((c, i) => (
                <CategoryCard
                  key={effectiveCategory(c.value)}
                  category={effectiveCategory(c.value)}
                  label={
                    shareOff.has(c.value) ? `${c.label}(${currentTitle === 'トス実績' ? 'トス実績用' : 'アポ実績用'})` : c.label
                  }
                  shared={c.shared}
                  shareControl={
                    c.shared ? (
                      <ShareToggle
                        on={!shareOff.has(c.value)}
                        fixedReason={FIXED_SHARED_REASON[c.value]}
                        disabled={!SPLITTABLE.has(c.value) || shareMutation.isPending}
                        onToggle={(next) => toggleShare(c.value, c.label, next)}
                      />
                    ) : undefined
                  }
                  simpleLabel={SIMPLE_LABEL_CATEGORIES.has(c.value)}
                  rowColor={!NO_ROW_COLOR_CATEGORIES.has(c.value)}
                  moveButtons={
                    <CardMoveButtons
                      canUp={i > 0}
                      canDown={i < cards.length - 1}
                      onMove={(dir) =>
                        saveOrder.mutate({ tab: currentTitle, keys: swap(cards.map((x) => x.value), i, i + dir) })
                      }
                    />
                  }
                />
              ))}
            </div>
          </>
        )}
        {currentTitle === DEALS_TAB && <DealsMasterTab />}
        {currentTitle === '商材・流入元' && <ProductsAndSources />}
        {currentTitle === 'アポ詳細FMT' && <TemplateEditors />}
      </div>
    </AppLayout>
  );
}

function ColorHelp() {
  return (
    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
      各項目カードで選択肢の追加・名前変更・並び替え・削除と、選んだときの<strong>文字色</strong>・<strong>行の塗りつぶし色</strong>を設定できます。
      1行に色付きの選択肢が複数あるときは、<strong>このページで上にある項目ほど優先</strong>されます(カード右上の↑↓で並び替え)。
      <span style={{ color: 'var(--color-primary)' }}> 共通 ON</span> の項目は他の画面と連動します。OFF にするとトス実績とアポ実績で別々の選択肢になります。
    </p>
  );
}

/** 共通のオン/オフ(要望)。オフ=トス実績とアポ実績で独立した選択肢 */
function ShareToggle({
  on,
  disabled,
  fixedReason,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  fixedReason?: string;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(!on)}
      title={
        fixedReason ??
        (on ? 'トス実績・アポ実績で共通の選択肢です。押すと独立(別々の選択肢)にします' : 'トス実績・アポ実績で別々の選択肢です。押すと共通に戻します')
      }
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '1px 7px',
        borderRadius: 4,
        border: '1px solid ' + (on ? 'var(--color-primary-border)' : 'var(--color-border-strong)'),
        background: on ? 'var(--color-primary-soft)' : 'var(--color-surface)',
        color: on ? 'var(--color-primary)' : 'var(--color-text-muted)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {on ? '共通 ON' : '共通 OFF(独立)'}
    </button>
  );
}

function CardMoveButtons({ canUp, canDown, onMove }: { canUp: boolean; canDown: boolean; onMove: (dir: -1 | 1) => void }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2, marginLeft: 'auto' }}>
      <button type="button" disabled={!canUp} onClick={() => onMove(-1)} title="上へ(優先度を上げる)" style={{ width: 24, height: 22, padding: 0, fontSize: 11 }}>
        ↑
      </button>
      <button type="button" disabled={!canDown} onClick={() => onMove(1)} title="下へ(優先度を下げる)" style={{ width: 24, height: 22, padding: 0, fontSize: 11 }}>
        ↓
      </button>
    </span>
  );
}

/** 色の指定(未設定=色なし)。×で色なしに戻す */
function ColorPick({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (v: string) => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0, fontSize: 10, color: 'var(--color-text-muted)' }}>
      {label}
      <input
        type="color"
        value={value || '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        title={`${label}${value ? '' : '(未設定)'}`}
        style={{ width: 22, height: 22, padding: 0, opacity: value ? 1 : 0.35 }}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} title={`${label}を解除`} style={{ width: 16, height: 16, padding: 0, fontSize: 10, lineHeight: 1 }}>
          ×
        </button>
      )}
    </span>
  );
}

/** 選択肢1つ分の行(名前・文字色・塗りつぶし・並び替え・削除) */
function OptionRow({
  name,
  color,
  textColor,
  showColors,
  preview,
  extra,
  onRename,
  onColor,
  onTextColor,
  onMove,
  canUp,
  canDown,
  onDelete,
}: {
  name: string;
  color: string | null | undefined;
  textColor: string | null | undefined;
  showColors: boolean;
  preview?: boolean;
  extra?: ReactNode;
  onRename: (v: string) => void;
  onColor: (v: string) => void;
  onTextColor: (v: string) => void;
  onMove: (dir: -1 | 1) => void;
  canUp: boolean;
  canDown: boolean;
  onDelete: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 0', borderBottom: '1px solid var(--color-sunken)' }}>
      <span style={{ display: 'inline-flex', flexDirection: 'column', flexShrink: 0 }}>
        <button type="button" disabled={!canUp} onClick={() => onMove(-1)} title="上へ" style={{ width: 18, height: 12, padding: 0, fontSize: 8, lineHeight: 1 }}>
          ▲
        </button>
        <button type="button" disabled={!canDown} onClick={() => onMove(1)} title="下へ" style={{ width: 18, height: 12, padding: 0, fontSize: 8, lineHeight: 1 }}>
          ▼
        </button>
      </span>
      <input
        key={name}
        defaultValue={name}
        onBlur={(e) => e.target.value !== name && onRename(e.target.value)}
        style={{
          flex: 1,
          padding: 4,
          fontSize: 12,
          minWidth: 0,
          // 設定した色をその場で確認できるように
          ...(preview && showColors ? { background: color || undefined, color: textColor || undefined } : {}),
        }}
      />
      {extra}
      {showColors && (
        <>
          <ColorPick label="文字" value={textColor} onChange={onTextColor} />
          <ColorPick label="塗り" value={color} onChange={onColor} />
        </>
      )}
      <button type="button" onClick={onDelete} title="削除" style={{ flexShrink: 0, padding: '2px 6px', fontSize: 11, color: 'var(--color-danger)' }}>
        削除
      </button>
    </div>
  );
}

/**
 * アポ詳細FMTに差し込める項目(要望: {{storeName}}のようなコードではなく、どこの情報を引くか分かるように)。
 * 名称はAPI側 TEMPLATE_FIELD_ALIASES(toss-appointment-automation.util.ts)と揃えること。
 */
const TEMPLATE_FIELDS: { key: string; label: string; source: string; group: string }[] = [
  { key: 'storeName', label: '店舗名', source: 'トス実績の「店舗名」', group: 'トス実績の列' },
  { key: 'contactName', label: '担当者名', source: 'トス実績の「担当者名」', group: 'トス実績の列' },
  { key: 'storePhone', label: '店舗連絡先', source: 'トス実績の「店舗連絡先」', group: 'トス実績の列' },
  { key: 'address', label: '住所', source: 'トス実績の「住所」', group: 'トス実績の列' },
  { key: 'industry', label: '業種', source: 'トス実績の「業種」', group: 'トス実績の列' },
  { key: 'apStaffName', label: 'アポインター', source: 'トス実績の「AP」', group: 'トス実績の列' },
  { key: 'preConfirmName', label: '前確者', source: 'トス実績の「前確」', group: 'トス実績の列' },
  { key: 'listName', label: 'リスト名', source: 'トス実績の「リスト」', group: 'トス実績の列' },
  { key: 'nextActionAt', label: '取り次ぎ日時', source: 'トス実績の「次回対応日」+「対応時間」(例: 9/25(木) 14:00)', group: 'トス実績の列' },
  { key: 'hook', label: 'フック', source: 'アポ変換時に選ぶ「商談形式(フック)」', group: 'アポイントに変更するときの入力' },
  { key: 'acquisitionAngle', label: '獲得角度', source: 'アポ変換時に選ぶ「商談形式(フック)」(フックと同じ値)', group: 'アポイントに変更するときの入力' },
  { key: 'meetingAt', label: '商談日時', source: 'アポ変換時に入力する「商談日時」(例: 9/30(火) 15:00)', group: 'アポイントに変更するときの入力' },
  { key: 'preContactAt', label: '前連日時', source: 'アポ変換時に入力する「前連日時」', group: 'アポイントに変更するときの入力' },
  { key: 'meetingUrl', label: 'GoogleMeetURL', source: 'Google Meet 連携で自動発行されたURL(HPZOOMのみ。発行後に自動で入ります)', group: '自動' },
];
const FIELD_BY_KEY = new Map(TEMPLATE_FIELDS.map((f) => [f.key, f]));
const FIELD_BY_LABEL = new Map(TEMPLATE_FIELDS.map((f) => [f.label, f]));
const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** 旧形式の {{storeName}} を {{店舗名}} に置き換えて表示する */
function toJapaneseTokens(text: string): string {
  return text.replace(TOKEN_RE, (m, name: string) => {
    const f = FIELD_BY_KEY.get(name);
    return f ? `{{${f.label}}}` : m;
  });
}

/** テンプレートを「文字」と「差し込み項目」に分けてプレビュー表示する */
function TemplatePreview({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(text.slice(last, idx));
    const f = FIELD_BY_LABEL.get(m[1]) ?? FIELD_BY_KEY.get(m[1]);
    parts.push(
      <span
        key={i++}
        title={f ? `引用元: ${f.source}` : 'この項目名は差し込み項目にありません(空欄になります)'}
        style={{
          display: 'inline-block',
          padding: '0 6px',
          margin: '0 1px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          background: f ? 'var(--color-primary-soft)' : 'var(--color-danger-soft)',
          color: f ? 'var(--color-primary)' : 'var(--color-danger)',
          border: `1px solid ${f ? 'var(--color-primary)' : 'var(--color-danger)'}`,
        }}
      >
        {f ? f.label : `?${m[1]}`}
        {f && <span style={{ opacity: 0.8 }}> ← {f.source.replace(/\(.*\)$/, '')}</span>}
      </span>,
    );
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <div
      style={{
        whiteSpace: 'pre-wrap',
        fontSize: 12,
        lineHeight: 1.9,
        padding: 10,
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-sunken)',
        minHeight: 300,
        maxHeight: 560,
        overflowY: 'auto',
      }}
    >
      {parts}
    </div>
  );
}

/**
 * 自動作成される備考欄のテンプレートを編集する共通部品(要望)。system-settingsの指定キーを利用する
 * (値は自由な複数行文字列のためステータスマスタの表示名欄には収まらず、system-settingsのJSON値
 * ストアを流用している)。テンプレートが複数あるため、キー・説明文を差し替えて使い回す。
 * 差し込み項目は {{店舗名}} のような日本語名で書く(旧形式 {{storeName}} も表示時に日本語へ変換)。
 */
function TemplateEditor({ settingKey, title, description }: { settingKey: string; title: string; description: string }) {
  const { data: settings, isLoading } = useSystemSettings();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const current = settings?.find((s) => s.key === settingKey);
  const value = draft ?? toJapaneseTokens(typeof current?.value === 'string' ? current.value : '');

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/system-settings/${settingKey}`, { value }),
    onSuccess: () => {
      setMessage('保存しました');
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
    },
  });

  // カーソル位置に差し込み項目を入れる
  const insertField = (label: string) => {
    const token = `{{${label}}}`;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setDraft(value.slice(0, start) + token + value.slice(end));
    setMessage(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  if (isLoading) return <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>;

  const groups = [...new Set(TEMPLATE_FIELDS.map((f) => f.group))];

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 15, marginBottom: 6 }}>{title}</h2>
      <p style={{ fontSize: 12, color: 'var(--color-text-faint)', marginBottom: 8 }}>{description}</p>
      {message && <p style={{ color: '#16a34a', fontSize: 12, marginBottom: 8 }}>{message}</p>}

      {/* 差し込み項目パレット: クリックでカーソル位置に挿入 */}
      <div
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 10px',
          marginBottom: 8,
          background: 'var(--color-surface)',
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}>
          差し込み項目(クリックでカーソル位置に入ります。アポに変換したとき、引用元の値に置き換わります。ボタンにマウスを乗せると引用元が出ます)
        </div>
        {groups.map((g) => (
          <div key={g} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-faint)', width: 170, flexShrink: 0 }}>{g}</span>
            {TEMPLATE_FIELDS.filter((f) => f.group === g).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => insertField(f.label)}
                title={`引用元: ${f.source}`}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: '1px solid var(--color-primary)',
                  background: 'var(--color-primary-soft)',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                }}
              >
                ＋{f.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>編集</div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setDraft(e.target.value);
              setMessage(null);
            }}
            style={{ width: '100%', minHeight: 300, fontSize: 12, padding: 10, lineHeight: 1.9 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
            見え方(青い部分が自動で入る項目。← の後ろが引用元。赤は存在しない項目名)
          </div>
          <TemplatePreview text={value} />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          保存する
        </button>
      </div>
    </div>
  );
}

function TemplateFieldsTable() {
  const th = { textAlign: 'left', padding: '4px 10px', borderBottom: '1px solid var(--color-border)' } as const;
  return (
    <details style={{ marginBottom: 20, fontSize: 12 }}>
      <summary style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }}>差し込み項目と引用元の一覧</summary>
      <table style={{ marginTop: 8, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>書き方</th>
            <th style={th}>引用元(どこの情報が入るか)</th>
          </tr>
        </thead>
        <tbody>
          {TEMPLATE_FIELDS.map((f) => (
            <tr key={f.key}>
              <td style={{ padding: '3px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>{`{{${f.label}}}`}</td>
              <td style={{ padding: '3px 10px' }}>{f.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function TemplateEditors() {
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
        トス実績を「アポイント」に変更したとき、選ばれた<b>商談形式</b>によってどちらかのフォーマットが
        アポ詳細(備考)へ自動的に入ります。HPZOOM = オンライン用、それ以外(撮＆訪 / HP＆訪 / 電気フック) = 訪問用。
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8, lineHeight: 1.7 }}>
        <b>{'{{店舗名}}'}</b> のように二重中括弧で囲んだ項目が、トス実績などの実際の値に置き換わります。それ以外の文字はそのまま入ります。
      </p>
      <TemplateFieldsTable />
      <TemplateEditor
        settingKey="tossAppointmentMemoTemplate"
        title="アポ詳細FMT: オンライン用(HPZOOM)"
        description="商談形式が HPZOOM のときのアポ詳細(備考)の雛形です。"
      />
      <TemplateEditor
        settingKey="tossAppointmentMemoTemplateVisit"
        title="アポ詳細FMT: 訪問用(撮＆訪 / HP＆訪 / 電気フック)"
        description="商談形式が HPZOOM 以外のときのアポ詳細(備考)の雛形です。"
      />
    </div>
  );
}

/** CLカレンダーの前連(30分予定)の色。全前連で統一の1色(要望) */
function PreContactColorSetting() {
  const { data: settings } = useSystemSettings();
  const queryClient = useQueryClient();
  const current = settings?.find((x) => x.key === 'calendarPreContactColor')?.value;
  const color = typeof current === 'string' ? current : '#ff887c';
  const save = useMutation({
    mutationFn: (value: string) => api.put('/system-settings/calendarPreContactColor', { value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-settings'] }),
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--color-border)', fontSize: 12 }}>
      <span>前連(30分予定)の色 ※全部署共通</span>
      <input
        key={color}
        type="color"
        defaultValue={color}
        // ピッカーを閉じた時点で保存(ドラッグ中に何度も保存しない)
        ref={(el) => {
          if (el) el.onchange = () => save.mutate(el.value);
        }}
        style={{ width: 24, height: 24, padding: 0 }}
      />
      {save.isSuccess && <span style={{ color: '#16a34a', fontSize: 11 }}>保存しました</span>}
    </div>
  );
}

function CardFrame({ title, badge, moveButtons, children }: { title: string; badge?: ReactNode; moveButtons?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14, background: 'var(--color-surface)' }}>
      <h2 style={{ fontSize: 15, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        {title}
        {badge}
        {moveButtons}
      </h2>
      {children}
    </div>
  );
}

function SharedBadge() {
  return (
    <span
      title="複数画面で共通。ここで編集すると全画面に反映されます"
      style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary-soft)', borderRadius: 4, padding: '1px 5px' }}
    >
      共通
    </span>
  );
}

function CategoryCard({
  category,
  label,
  simpleLabel,
  shared,
  shareControl,
  rowColor,
  moveButtons,
}: {
  category: string;
  label: string;
  simpleLabel: boolean;
  shared?: boolean;
  shareControl?: ReactNode;
  rowColor: boolean;
  moveButtons?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const { data: statuses, isLoading } = useQuery({
    queryKey: ['status-master', category],
    queryFn: () => api.get<StatusRow[]>(`/status-master?category=${category}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['status-master', category] });
    // 一覧画面のプルダウン・行の色へも反映する
    queryClient.invalidateQueries({ queryKey: ['statuses'] });
  };

  const updateMutation = useMutation({
    // id はURLに載せる。bodyへ入れると forbidNonWhitelisted で弾かれる(「property id should not exist」)。
    mutationFn: ({ id, ...patch }: { id: string; displayName?: string; color?: string; textColor?: string; onlineColor?: string; active?: boolean; order?: number }) =>
      api.patch(`/status-master/${id}`, patch),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  const isDepartment = category === 'DEPARTMENT_BRANCH';

  const genCode = () => (simpleLabel ? `${category}_${crypto.randomUUID().slice(0, 8)}` : newCode);

  const createMutation = useMutation({
    mutationFn: () => api.post('/status-master', { category, internalCode: genCode(), displayName: newLabel }),
    onSuccess: () => {
      setNewCode('');
      setNewLabel('');
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '作成に失敗しました'),
  });

  // 複数行/タブ区切りの貼り付けで一括追加(スプレッドシートからのコピペ対応)。
  // 一括追加分の内部コードは自動採番(表示名で参照する運用)。
  const bulkCreateMutation = useMutation({
    mutationFn: async (labels: string[]) => {
      for (const displayName of labels) {
        await api.post('/status-master', {
          category,
          internalCode: `${category}_${crypto.randomUUID().slice(0, 8)}`,
          displayName,
        });
      }
    },
    onSuccess: () => {
      setNewLabel('');
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '一括追加に失敗しました'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/status-master/${id}`),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : '削除に失敗しました'),
  });

  // 並び替え: 表示順どおりに order を振り直す(同じ order が混ざっていても確実に入れ替わるように)
  const move = (index: number, dir: -1 | 1) => {
    if (!statuses) return;
    const next = swap(statuses, index, index + dir);
    next.forEach((s, i) => {
      if (s.order !== i + 1) updateMutation.mutate({ id: s.id, order: i + 1 });
    });
  };

  return (
    <CardFrame title={label} badge={shareControl ?? (shared && <SharedBadge />)} moveButtons={moveButtons}>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      {isLoading ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>
      ) : (
        <div style={{ marginBottom: 10 }}>
          {statuses?.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>まだ登録がありません</p>}
          {statuses?.map((s, i) => (
            <OptionRow
              key={s.id}
              name={s.displayName}
              color={s.color}
              textColor={s.textColor}
              showColors={rowColor}
              preview
              canUp={i > 0}
              canDown={i < statuses.length - 1}
              onMove={(dir) => move(i, dir)}
              onRename={(v) => updateMutation.mutate({ id: s.id, displayName: v })}
              onColor={(v) => updateMutation.mutate({ id: s.id, color: v })}
              onTextColor={(v) => updateMutation.mutate({ id: s.id, textColor: v })}
              onDelete={() => {
                if (window.confirm(`「${s.displayName}」を削除しますか？`)) deleteMutation.mutate(s.id);
              }}
              extra={
                <>
                  {isDepartment && (
                    // 部署はCLカレンダーの色: 訪問/オンラインで別の色を指定できる(要望)
                    <>
                      <ColorPick label="訪問" value={s.color} onChange={(v) => updateMutation.mutate({ id: s.id, color: v })} />
                      <ColorPick label="オンライン" value={s.onlineColor} onChange={(v) => updateMutation.mutate({ id: s.id, onlineColor: v })} />
                    </>
                  )}
                  {!s.active && (
                    // 以前「有効」を外した選択肢。一覧のプルダウンには出ない
                    <button
                      type="button"
                      onClick={() => updateMutation.mutate({ id: s.id, active: true })}
                      title="一覧のプルダウンに表示されていません。押すと表示に戻します"
                      style={{ flexShrink: 0, padding: '1px 5px', fontSize: 10 }}
                    >
                      非表示中→表示
                    </button>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {!simpleLabel && (
          <input placeholder="内部コード" value={newCode} onChange={(e) => setNewCode(e.target.value)} style={{ width: 90, padding: 5, fontSize: 12 }} />
        )}
        <input
          placeholder={simpleLabel ? '名前を追加(複数行の貼り付けで一括追加)' : '表示名'}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newLabel && (simpleLabel || newCode)) createMutation.mutate();
          }}
          onPaste={(e) => {
            const raw = e.clipboardData.getData('text');
            const items = raw
              .split(/[\r\n\t]+/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (items.length > 1) {
              e.preventDefault();
              bulkCreateMutation.mutate(items);
            }
          }}
          style={{ flex: 1, padding: 5, fontSize: 12, minWidth: 0 }}
        />
        <button onClick={() => createMutation.mutate()} disabled={(!simpleLabel && !newCode) || !newLabel} style={{ fontSize: 12, padding: '5px 10px', flexShrink: 0 }}>
          {bulkCreateMutation.isPending ? '追加中…' : '追加'}
        </button>
      </div>
      {isDepartment && <PreContactColorSetting />}
    </CardFrame>
  );
}

/** マスタ管理 > 案件管理: 案件管理のプルダウン列ごとの選択肢・色(要望) */
function DealsMasterTab() {
  const { data: fields, isLoading } = useDealFields();
  const { data: savedOrder } = useMasterOrder();
  const saveOrder = useSaveCardOrder();
  const selects = [...(fields ?? [])].filter((f) => f.dataType === 'SELECT').sort((a, b) => a.order - b.order);
  const keys = applySavedOrder(
    selects.map((f) => f.fieldKey),
    savedOrder?.[DEALS_TAB],
  );
  const cards = keys.map((k) => selects.find((f) => f.fieldKey === k)!);

  return (
    <>
      <ColorHelp />
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
        列そのものの追加・名前変更・削除は、案件管理の「列を管理」から行えます。
      </p>
      {isLoading && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {cards.map((f, i) => (
          <DealFieldCard
            key={f.id}
            field={f}
            moveButtons={
              <CardMoveButtons
                canUp={i > 0}
                canDown={i < cards.length - 1}
                onMove={(dir) => saveOrder.mutate({ tab: DEALS_TAB, keys: swap(keys, i, i + dir) })}
              />
            }
          />
        ))}
      </div>
    </>
  );
}

function DealFieldCard({ field, moveButtons }: { field: DealFieldItem; moveButtons: ReactNode }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const options = [...field.options].sort((a, b) => a.order - b.order);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['deal-fields'] });
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : '更新に失敗しました');

  const updateMutation = useMutation({
    mutationFn: (v: { id: string; patch: { label?: string; color?: string; textColor?: string; order?: number } }) =>
      api.patch(`/deals/field-options/${v.id}`, v.patch),
    onSuccess: invalidate,
    onError,
  });
  const createMutation = useMutation({
    mutationFn: (labels: string[]) => Promise.all(labels.map((label) => api.post(`/deals/fields/${field.id}/options`, { label }))),
    onSuccess: () => {
      setNewLabel('');
      setError(null);
      invalidate();
    },
    onError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/deals/field-options/${id}`),
    onSuccess: invalidate,
    onError,
  });

  const move = (index: number, dir: -1 | 1) => {
    const next = swap(options, index, index + dir);
    next.forEach((o, i) => {
      if (o.order !== (i + 1) * 10) updateMutation.mutate({ id: o.id, patch: { order: (i + 1) * 10 } });
    });
  };

  return (
    <CardFrame title={field.label} moveButtons={moveButtons}>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 10 }}>
        {options.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>まだ選択肢がありません</p>}
        {options.map((o, i) => (
          <OptionRow
            key={o.id}
            name={o.label}
            color={o.color}
            textColor={o.textColor}
            showColors
            preview
            canUp={i > 0}
            canDown={i < options.length - 1}
            onMove={(dir) => move(i, dir)}
            onRename={(v) => updateMutation.mutate({ id: o.id, patch: { label: v } })}
            onColor={(v) => updateMutation.mutate({ id: o.id, patch: { color: v } })}
            onTextColor={(v) => updateMutation.mutate({ id: o.id, patch: { textColor: v } })}
            onDelete={() => {
              if (window.confirm(`「${o.label}」を削除しますか？`)) deleteMutation.mutate(o.id);
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          placeholder="選択肢を追加(複数行の貼り付けで一括追加)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newLabel.trim()) createMutation.mutate([newLabel.trim()]);
          }}
          onPaste={(e) => {
            const items = e.clipboardData
              .getData('text')
              .split(/[\r\n\t]+/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (items.length > 1) {
              e.preventDefault();
              createMutation.mutate(items);
            }
          }}
          style={{ flex: 1, padding: 5, fontSize: 12, minWidth: 0 }}
        />
        <button onClick={() => newLabel.trim() && createMutation.mutate([newLabel.trim()])} disabled={!newLabel.trim()} style={{ fontSize: 12, padding: '5px 10px', flexShrink: 0 }}>
          追加
        </button>
      </div>
    </CardFrame>
  );
}

function ProductsAndSources() {
  const { data: products } = useProducts();
  const { data: sources } = useSources();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14, background: 'var(--color-surface)' }}>
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>商材</h2>
        <ul style={{ fontSize: 13, paddingLeft: 18 }}>
          {products?.map((p) => <li key={p.id}>{p.name}</li>)}
        </ul>
      </div>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14, background: 'var(--color-surface)' }}>
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>流入元</h2>
        <ul style={{ fontSize: 13, paddingLeft: 18 }}>
          {sources?.map((s) => <li key={s.id}>{s.name}</li>)}
        </ul>
      </div>
    </div>
  );
}
