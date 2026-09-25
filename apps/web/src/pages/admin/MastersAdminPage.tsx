import { ReactNode, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useProducts, useSources, useSystemSettings } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

interface CategoryDef {
  value: string;
  label: string;
  /** 複数画面で使う項目。ここで編集すると全画面に反映される */
  shared?: boolean;
}

// 画面ごとのタブ。各タブの中は「項目」ごとのカードに分かれる(要望: 画面毎→項目毎)。
// 同じ項目(部署・商談形式・前確・業種など)は複数タブに出るが、中身は共通で連動する。
const TAB_GROUPS: { title: string; categories: CategoryDef[] }[] = [
  {
    title: 'トス実績',
    categories: [
      { value: 'MEETING_FORMAT', label: '商談形式(フック)', shared: true },
      { value: 'TOSS_PRE_CONFIRM', label: '前確担当者', shared: true },
      { value: 'TOSS_PROGRESS', label: '進捗(状況 / ステータス兼用)' },
      { value: 'TOSS_NG_REASON', label: 'NG理由' },
      { value: 'DEPARTMENT_BRANCH', label: '部署(CT/CH東/CH西)', shared: true },
      { value: 'INDUSTRY', label: '業種', shared: true },
      { value: 'EXISTING_CONTRACT', label: '既契約', shared: true },
      { value: 'PROPOSAL_LOCATION', label: '提案(場所)', shared: true },
    ],
  },
  {
    title: 'アポ実績',
    categories: [
      { value: 'MEETING_FORMAT', label: '商談形式(フック)', shared: true },
      { value: 'TOSS_PRE_CONFIRM', label: '前確担当者', shared: true },
      { value: 'APPOINTMENT_PRE_CONTACT', label: '前連担当' },
      { value: 'APPOINTMENT_CLOSER', label: 'CL(クロージング担当)', shared: true },
      { value: 'DEPARTMENT_BRANCH', label: '部署(CT/CH東/CH西)', shared: true },
      { value: 'INDUSTRY', label: '業種', shared: true },
      { value: 'EXISTING_CONTRACT', label: '既契約', shared: true },
      { value: 'PROPOSAL_LOCATION', label: '提案場所', shared: true },
      { value: 'APPOINTMENT', label: '商談ステータス' },
      { value: 'APPOINTMENT_PROGRESS', label: '進捗' },
      { value: 'APPOINTMENT_HP_PROGRESS', label: 'HP進捗' },
      { value: 'APPOINTMENT_TYPE', label: '種別' },
      { value: 'APPOINTMENT_ACQUISITION_METHOD', label: '獲得方法' },
      { value: 'APPOINTMENT_ANSHIN_BIZ_STATUS', label: 'あんしんBiz' },
      { value: 'APPOINTMENT_ANSHIN_BIZ_LOST_REASON', label: 'あんしんBiz失注理由' },
      { value: 'APPOINTMENT_MOBILE_STATUS', label: 'モバイル' },
      { value: 'APPOINTMENT_MOBILE_LOST_REASON', label: 'モバイル失注理由' },
      { value: 'APPOINTMENT_FUNFO_STATUS', label: 'funfo' },
      { value: 'APPOINTMENT_FUNFO_LOST_REASON', label: 'funfo失注理由' },
      { value: 'APPOINTMENT_CONSENT_FORM_TYPE', label: '同意書種別' },
      { value: 'APPOINTMENT_DELIVERY_METHOD', label: '交付方法' },
      { value: 'APPOINTMENT_DELIVERY_STATUS', label: '交付状況' },
      { value: 'VISIT', label: '訪問ステータス' },
    ],
  },
  {
    title: 'エントリー管理',
    categories: [{ value: 'MATCHING', label: 'マッチング状況' }],
  },
  {
    title: 'CLカレンダー',
    categories: [
      { value: 'DEPARTMENT_BRANCH', label: '部署(予定の色分けにも使用)', shared: true },
      { value: 'APPOINTMENT_CLOSER', label: 'CL(クロージング担当)', shared: true },
      { value: 'MEETING_FORMAT', label: '商談形式(フック / 題名の【】に入る)', shared: true },
    ],
  },
  {
    title: 'その他',
    categories: [
      {
        value: 'TOSS_HOOK_LABEL_MAP',
        label: 'Googleフォームのフック文言 → 商談形式の変換(内部コード=フォームの原文、表示名=変換後)',
      },
    ],
  },
];

// 内部コードに意味を持たせず単純な選択肢名の管理として使うカテゴリでは、追加フォームで
// 表示名のみ入力させ内部コードは自動採番する。ただし以下は内部コード自体が判定キーとして
// 使われるため対象外(基本ステータス=自動化コード、部署=自動化コード、フック変換=変換元テキスト)。
const NON_SIMPLE_LABEL_CATEGORIES = new Set(['TOSS', 'APPOINTMENT', 'VISIT', 'MATCHING', 'DEPARTMENT_BRANCH', 'TOSS_HOOK_LABEL_MAP']);
const ALL_CATEGORY_VALUES = new Set(TAB_GROUPS.flatMap((g) => g.categories.map((c) => c.value)));
const SIMPLE_LABEL_CATEGORIES = new Set([...ALL_CATEGORY_VALUES].filter((v) => !NON_SIMPLE_LABEL_CATEGORIES.has(v)));

interface StatusRow {
  id: string;
  category: string;
  internalCode: string;
  displayName: string;
  color: string | null;
  order: number;
  active: boolean;
}

// カテゴリ一覧以外の特殊タブ(商材・流入元の閲覧、自動作成テンプレートの編集)
const EXTRA_TAB_TITLES = ['商材・流入元', 'アポ詳細FMT'];

export function MastersAdminPage() {
  const [tabIndex, setTabIndex] = useState(0);
  const allTitles = [...TAB_GROUPS.map((g) => g.title), ...EXTRA_TAB_TITLES];

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

        {tabIndex < TAB_GROUPS.length && (
          <>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              「{allTitles[tabIndex]}」で使うプルダウンの選択肢です。各項目カードで追加・名前変更・削除できます。
              <span style={{ color: 'var(--color-primary)' }}> 共通</span> の項目は他の画面と連動します。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {TAB_GROUPS[tabIndex].categories.map((c) => (
                <CategoryCard
                  key={c.value}
                  category={c.value}
                  label={c.label}
                  shared={c.shared}
                  simpleLabel={SIMPLE_LABEL_CATEGORIES.has(c.value)}
                />
              ))}
            </div>
          </>
        )}
        {tabIndex === TAB_GROUPS.length && <ProductsAndSources />}
        {tabIndex === TAB_GROUPS.length + 1 && <TemplateEditors />}
      </div>
    </AppLayout>
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
        {f && <span style={{ fontWeight: 400, opacity: 0.8 }}> ← {f.source.replace(/\(.*\)$/, '')}</span>}
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

function CategoryCard({
  category,
  label,
  simpleLabel,
  shared,
}: {
  category: string;
  label: string;
  simpleLabel: boolean;
  shared?: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const { data: statuses, isLoading } = useQuery({
    queryKey: ['status-master', category],
    queryFn: () => api.get<StatusRow[]>(`/status-master?category=${category}`),
  });

  const updateMutation = useMutation({
    // id はURLに載せる。bodyへ入れると forbidNonWhitelisted で弾かれる(「property id should not exist」)。
    mutationFn: ({ id, ...patch }: { id: string; displayName?: string; color?: string; active?: boolean }) =>
      api.patch(`/status-master/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status-master', category] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  const genCode = () =>
    simpleLabel ? `${category}_${crypto.randomUUID().slice(0, 8)}` : newCode;

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/status-master', { category, internalCode: genCode(), displayName: newLabel }),
    onSuccess: () => {
      setNewCode('');
      setNewLabel('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['status-master', category] });
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
      queryClient.invalidateQueries({ queryKey: ['status-master', category] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '一括追加に失敗しました'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/status-master/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status-master', category] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : '削除に失敗しました'),
  });

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 14,
        background: 'var(--color-surface)',
      }}
    >
      <h2 style={{ fontSize: 15, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {shared && (
          <span
            title="複数画面で共通。ここで編集すると全画面に反映されます"
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--color-primary)',
              background: 'var(--color-primary-soft)',
              borderRadius: 4,
              padding: '1px 5px',
            }}
          >
            共通
          </span>
        )}
      </h2>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      {isLoading ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>
      ) : (
        <div style={{ marginBottom: 10 }}>
          {statuses?.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>まだ登録がありません</p>}
          {statuses?.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
              <input
                defaultValue={s.displayName}
                onBlur={(e) => e.target.value !== s.displayName && updateMutation.mutate({ id: s.id, displayName: e.target.value })}
                style={{ flex: 1, padding: 4, fontSize: 12, minWidth: 0 }}
              />
              <input
                type="color"
                defaultValue={s.color ?? '#9ca3af'}
                onChange={(e) => updateMutation.mutate({ id: s.id, color: e.target.value })}
                title="塗りつぶし色"
                style={{ width: 24, height: 24, padding: 0, flexShrink: 0 }}
              />
              <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }} title="有効">
                <input
                  type="checkbox"
                  defaultChecked={s.active}
                  onChange={(e) => updateMutation.mutate({ id: s.id, active: e.target.checked })}
                />
                有効
              </label>
              <button
                onClick={() => {
                  if (window.confirm(`「${s.displayName}」を削除しますか？`)) deleteMutation.mutate(s.id);
                }}
                title="削除"
                style={{ flexShrink: 0, padding: '2px 6px', fontSize: 11, color: 'var(--color-danger)' }}
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {!simpleLabel && (
          <input
            placeholder="内部コード"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            style={{ width: 90, padding: 5, fontSize: 12 }}
          />
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
        <button
          onClick={() => createMutation.mutate()}
          disabled={(!simpleLabel && !newCode) || !newLabel}
          style={{ fontSize: 12, padding: '5px 10px', flexShrink: 0 }}
        >
          {bulkCreateMutation.isPending ? '追加中…' : '追加'}
        </button>
      </div>
    </div>
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
