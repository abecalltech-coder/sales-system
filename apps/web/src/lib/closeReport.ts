/**
 * クローズ報告(要望: 商談後のクローズ結果を報告し、決まった書式の文章をコピーする)。
 * 項目の並び・種類はここで決め、項目名・選択肢などはマスタ管理「クローズ報告」で変更できる
 * (保存値は system-settings closeReportConfig。未設定の項目はここの既定値)。
 */

export type SectionKey = 'basic' | 'result' | 'indoor' | 'anshin' | 'mobile' | 'funfo' | 'detail';

export type FieldKind =
  | 'text'
  | 'number'
  | 'date'
  | 'choice' // 選択肢(少なければボタン、多ければプルダウン。選択肢が空ならテキスト入力)
  | 'user' // システムのユーザーから選ぶ
  | 'textarea'
  | 'fee' // 相対/供給管理費: 獲得プランに合わせて選択肢を作る
  | 'sites' // 拠点数 + 結果
  | 'settleDate'; // 日付 or 無し

export interface FieldDef {
  key: string;
  section: SectionKey;
  kind: FieldKind;
  label: string;
  options?: string[];
  /** ET・成約など「契約内容を入力する結果」のときだけ出す項目(クローズ結果の中) */
  contract?: boolean;
  /** 別の項目が、その項目の n 番目の選択肢のときだけ出す(選択肢の名前を変えても条件が崩れないよう番号で持つ) */
  showWhen?: { key: string; index: number };
}

export const SECTION_ORDER: SectionKey[] = ['basic', 'result', 'indoor', 'anshin', 'mobile', 'funfo', 'detail'];

const RESULTS = ['ET', '成約', '保留A', '保留B', '失注', '月内失注', '取次不可'];

export const FIELD_DEFS: FieldDef[] = [
  { key: 'storeName', section: 'basic', kind: 'text', label: '店舗名' },
  { key: 'visitDate', section: 'basic', kind: 'date', label: '訪問日' },
  { key: 'visitCount', section: 'basic', kind: 'choice', label: '訪問回数', options: ['1回目', '2回目', '3回目', '4回目', '5回目'] },
  { key: 'apStaff', section: 'basic', kind: 'user', label: 'アポインター' },
  { key: 'preConfirm', section: 'basic', kind: 'user', label: '前確担当' },
  { key: 'closer', section: 'basic', kind: 'user', label: 'クローザー' },

  { key: 'result', section: 'result', kind: 'choice', label: 'クローズ結果', options: RESULTS },
  {
    key: 'plan',
    section: 'result',
    kind: 'choice',
    label: '獲得プラン',
    contract: true,
    options: ['マーケットリンクGL（TMS）', 'マーケットリンクGH（TMS）', 'マーケットリンクGLSP', 'マーケットリンクGD', 'プレミアム（TMS）', 'プレミアム', '動力プレミアム', 'ガス'],
  },
  { key: 'campaign', section: 'result', kind: 'choice', label: 'キャンペーン', contract: true, options: ['ウェルカム割', 'スタート12', 'なし'] },
  { key: 'fee', section: 'result', kind: 'fee', label: '相対/供給管理費', contract: true },
  { key: 'maxUsage', section: 'result', kind: 'text', label: 'MAX使用量', contract: true },
  { key: 'payment', section: 'result', kind: 'choice', label: '支払い方法', contract: true, options: ['クレカ', '口座', 'コンビニ'] },
  { key: 'cb', section: 'result', kind: 'choice', label: '他社解約金補填・CB', contract: true, options: ['なし', '振込'] },
  { key: 'cbAmount', section: 'result', kind: 'text', label: '振込金額', contract: true, showWhen: { key: 'cb', index: 1 } },
  { key: 'enepal', section: 'result', kind: 'choice', label: 'エネパル解約金補填', contract: true, options: ['あり', 'なし'] },
  { key: 'agreement', section: 'result', kind: 'choice', label: '解約金補填同意書', contract: true, options: ['回収済み', '回収不要', '未回収'] },
  { key: 'paperBill', section: 'result', kind: 'choice', label: '紙明細', contract: true, options: ['あり', 'なし'] },

  { key: 'indoorView', section: 'indoor', kind: 'choice', label: 'Googleインドアビュー', options: ['撮影不要', '撮影済み', '予約'] },
  { key: 'photoAgreement', section: 'indoor', kind: 'choice', label: '撮影同意書', options: ['不要', '回収済み', '未回収'] },

  { key: 'anshinProposal', section: 'anshin', kind: 'choice', label: '提案', options: ['提案済み', '未提案'] },
  { key: 'anshinResult', section: 'anshin', kind: 'choice', label: '結果', options: ['獲得', '保留', '失注', '対象外'], showWhen: { key: 'anshinProposal', index: 0 } },
  {
    key: 'anshinLostReason',
    section: 'anshin',
    kind: 'choice',
    label: '失注理由',
    options: ['課金オプションネックNG', 'オプションの重複付帯NG', '面倒NG', '電気失注NG', 'コンビニ払い希望'],
    showWhen: { key: 'anshinResult', index: 2 },
  },

  { key: 'mobileProposal', section: 'mobile', kind: 'choice', label: '提案', options: ['提案済み', '未提案'] },
  { key: 'mobileResult', section: 'mobile', kind: 'choice', label: '結果', options: ['トスアップ'], showWhen: { key: 'mobileProposal', index: 0 } },

  { key: 'funfoProposal', section: 'funfo', kind: 'choice', label: '提案', options: ['提案済み', '未提案'] },
  { key: 'funfoReason', section: 'funfo', kind: 'text', label: '未提案理由' },

  { key: 'storeSites', section: 'detail', kind: 'sites', label: '店舗', options: RESULTS },
  { key: 'officeSites', section: 'detail', kind: 'sites', label: '事務所', options: RESULTS },
  { key: 'maxSites', section: 'detail', kind: 'number', label: '最大獲得拠点数' },
  { key: 'referral', section: 'detail', kind: 'choice', label: '紹介', options: ['有', '無'] },
  { key: 'settleDate', section: 'detail', kind: 'settleDate', label: '決着予定日' },
  { key: 'method', section: 'detail', kind: 'choice', label: '対応手段', options: ['-', '訪問', '電話'] },
  { key: 'storeSupport', section: 'detail', kind: 'choice', label: '店サポ解約誘導', options: ['有', '無'] },
  { key: 'logSubmit', section: 'detail', kind: 'choice', label: 'ログ提出', options: ['済', '未'] },
  { key: 'salesNumber', section: 'detail', kind: 'choice', label: '営業担当番号', options: [] },
  { key: 'chNumber', section: 'detail', kind: 'choice', label: 'ＣＨ代表番号', options: [] },
  { key: 'incompleteReason', section: 'detail', kind: 'text', label: '未完了理由' },
  { key: 'memo', section: 'detail', kind: 'textarea', label: '備考' },
];

export interface FeeRule {
  /** 獲得プラン名にこの文字が含まれていれば使う(上から順に判定) */
  match: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

export interface CloseReportConfig {
  title: string;
  maxResults: number;
  sections: Record<SectionKey, string>;
  fields: Record<string, { label: string; options: string[] }>;
  /** 契約内容(獲得プラン〜紙明細)を入力するクローズ結果 */
  contractResults: string[];
  feeRules: FeeRule[];
}

export const DEFAULT_CONFIG: CloseReportConfig = {
  title: 'クローズ結果報告',
  maxResults: 5,
  sections: { basic: '基本情報', result: 'クローズ結果', indoor: 'インドアビュー', anshin: 'あんしんBiz', mobile: '法人モバイル', funfo: 'funfo', detail: '詳細' },
  fields: Object.fromEntries(FIELD_DEFS.map((f) => [f.key, { label: f.label, options: f.options ?? [] }])),
  contractResults: ['ET', '成約'],
  feeRules: [
    { match: 'マーケットリンク', min: 6, max: 12, step: 0.5, unit: '円' },
    { match: 'プレミアム', min: 0, max: 19, step: 1, unit: '%' },
  ],
};

/** 保存された設定を既定値に重ねる(後から増えた項目は既定値で補う) */
export function mergeConfig(saved: unknown): CloseReportConfig {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<CloseReportConfig>;
  const fields = { ...DEFAULT_CONFIG.fields };
  for (const [k, v] of Object.entries(s.fields ?? {})) {
    if (fields[k] && v) fields[k] = { ...fields[k], ...v, options: Array.isArray(v.options) ? v.options : fields[k].options };
  }
  return {
    title: s.title || DEFAULT_CONFIG.title,
    maxResults: Math.min(10, Math.max(1, Number(s.maxResults) || DEFAULT_CONFIG.maxResults)),
    sections: { ...DEFAULT_CONFIG.sections, ...(s.sections ?? {}) },
    fields,
    contractResults: Array.isArray(s.contractResults) ? s.contractResults : DEFAULT_CONFIG.contractResults,
    feeRules: Array.isArray(s.feeRules) ? s.feeRules : DEFAULT_CONFIG.feeRules,
  };
}

/** 入力値。クローズ結果は件数ぶんの配列、拠点は <key>Count / <key>Result、決着予定日の「無し」は settleNone */
export interface CloseValues {
  [key: string]: unknown;
  results: Record<string, string>[];
}

export const emptyValues = (): CloseValues => ({ results: [{}], settleNone: '1', storeSitesCount: '0', officeSitesCount: '0' });

export const FIELD = Object.fromEntries(FIELD_DEFS.map((f) => [f.key, f])) as Record<string, FieldDef>;

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** 相対/供給管理費の選択肢(獲得プランに合うルールが無ければ出さない) */
export function feeOptions(config: CloseReportConfig, plan: string): string[] | null {
  const rule = config.feeRules.find((r) => r.match && plan.includes(r.match));
  if (!rule || !(rule.step > 0) || rule.max < rule.min) return null;
  const dec = (String(rule.step).split('.')[1] ?? '').length;
  const out: string[] = [];
  for (let i = 0; i <= 400; i++) {
    const n = rule.min + rule.step * i;
    if (n > rule.max + 1e-9) break;
    out.push(`${n.toFixed(dec)}${rule.unit}`);
  }
  return out;
}

/** その項目を今出すか(条件付き項目・契約内容・管理費) */
export function isVisible(config: CloseReportConfig, def: FieldDef, scope: Record<string, unknown>): boolean {
  if (def.contract && !config.contractResults.includes(str(scope.result))) return false;
  if (def.showWhen) {
    const opts = config.fields[def.showWhen.key]?.options ?? [];
    const target = opts[def.showWhen.index];
    if (!target || str(scope[def.showWhen.key]) !== target) return false;
  }
  if (def.kind === 'fee' && !feeOptions(config, str(scope.plan))) return false;
  return true;
}

export const circled = (i: number) => '①②③④⑤⑥⑦⑧⑨⑩'[i] ?? `(${i + 1})`;

/** "2026-10-26" → "10/26" */
const md = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[2])}/${Number(m[3])}` : iso;
};

/** 報告テキスト(要望の書式) */
export function buildText(config: CloseReportConfig, values: CloseValues, userName: (id: string) => string): string {
  const L = (k: string) => config.fields[k]?.label ?? FIELD[k]?.label ?? k;
  const v = (k: string, scope: Record<string, unknown> = values) => {
    const raw = str(scope[k]);
    return FIELD[k]?.kind === 'user' ? (raw ? userName(raw) : '') : raw;
  };
  const vis = (k: string, scope: Record<string, unknown> = values) => isVisible(config, FIELD[k], scope);
  const lines: string[] = [];
  lines.push(`【${config.title}】`);
  lines.push(`${L('storeName')}：${v('storeName')}`);
  const date = v('visitDate') ? md(v('visitDate')) : '';
  lines.push(`${L('visitDate')}/${L('visitCount').replace(/^訪問/, '')}：${date} / ${v('visitCount')}`);
  for (const k of ['apStaff', 'preConfirm', 'closer']) lines.push(`${L(k)}：${v(k)}`);

  values.results.forEach((r, i) => {
    lines.push('');
    lines.push(`${circled(i)}${L('result')}：${v('result', r)}`);
    for (const def of FIELD_DEFS.filter((d) => d.section === 'result' && d.key !== 'result' && d.key !== 'cbAmount')) {
      if (!vis(def.key, r)) continue;
      let val = v(def.key, r);
      // 振込のときは金額を続けて書く
      if (def.key === 'cb' && vis('cbAmount', r) && v('cbAmount', r)) val = `${val} ${v('cbAmount', r)}`;
      lines.push(`・${L(def.key)}：${val}`);
    }
  });

  for (const sec of ['indoor', 'anshin', 'mobile', 'funfo'] as SectionKey[]) {
    lines.push('');
    lines.push(`◆${config.sections[sec]}`);
    for (const def of FIELD_DEFS.filter((d) => d.section === sec)) {
      if (vis(def.key)) lines.push(`・${L(def.key)}：${v(def.key)}`);
    }
  }

  lines.push('');
  lines.push(`≪${config.sections.detail}≫`);
  for (const def of FIELD_DEFS.filter((d) => d.section === 'detail' && d.key !== 'memo')) {
    if (def.kind === 'sites') {
      const count = str(values[`${def.key}Count`]) || '0';
      const res = Number(count) > 0 ? str(values[`${def.key}Result`]) : '';
      lines.push(`${L(def.key)}：${count}拠点${res ? ` ${res}` : ''}`);
    } else if (def.kind === 'number') {
      lines.push(`${L(def.key)}：${v(def.key) ? `${v(def.key)}拠点` : ''}`);
    } else if (def.kind === 'settleDate') {
      lines.push(`${L(def.key)}：${v('settleDate') ? md(v('settleDate')) : '無し'}`);
    } else {
      lines.push(`${L(def.key)}：${v(def.key)}`);
    }
  }
  lines.push('');
  lines.push(`${L('memo')}：${v('memo')}`);
  return lines.join('\n');
}
