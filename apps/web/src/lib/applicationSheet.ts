/**
 * 申込情報/明細(要望)の項目定義と、全体コピー用のテキスト。
 * テキストの並び・見出し・記号はいただいた書式どおり(「/」のある項目はプルダウン)。
 */

export type FieldKind = 'text' | 'select' | 'masterSelect' | 'zipAddress' | 'yen' | 'kwh' | 'percent';

export interface FieldDef {
  key: string;
  label: string;
  kind?: FieldKind;
  options?: string[];
  /** 全体コピー時に先頭へ付ける「・」 */
  bullet?: boolean;
  placeholder?: string;
  /** この項目の前に空行を入れる(書式の区切り) */
  gapBefore?: boolean;
  /** 入力に合わせて自動で整える(date: 1980/01/23・month: 2026/09) */
  format?: 'date' | 'month';
  /** 決まった桁数(違うときは赤字で知らせる) */
  digits?: number;
  /** kind=masterSelect の選択肢(マスタ管理のカテゴリ) */
  masterCategory?: string;
  /** 画面の並び(要望): wide=1行ぶち抜き(住所)、solo=この項目だけで1行 */
  layout?: 'wide' | 'solo';
}

/** 申し込みプランの選択肢(マスタ管理「申込情報/明細」で編集) */
export const APPLICATION_PLAN_CATEGORY = 'APPLICATION_PLAN';

export const INPUT_CODES = ['CT', 'CH'];

export const APPLICATION_FIELDS: FieldDef[] = [
  { key: 'name', label: '申し込み名義', bullet: true },
  { key: 'nameKana', label: '申し込み名義(フリガナ)', bullet: true },
  { key: 'address', label: '申し込み住所', kind: 'zipAddress', bullet: true, layout: 'wide' },
  { key: 'repName', label: '代表者名', bullet: true },
  { key: 'repNameKana', label: '代表者名(フリガナ)', bullet: true },
  { key: 'repBirth', label: '代表生年月日', bullet: true, format: 'date', placeholder: '例: 1980/01/23' },
  { key: 'repPhone', label: '代表者電話番号', bullet: true },
  { key: 'storePhone', label: '店舗番号（あれば）', bullet: true },
  { key: 'callbackTime', label: '後確希望時間', bullet: true },
  { key: 'callbackContact', label: '後確連絡先', gapBefore: true },
  { key: 'smsTo', label: 'SMS送付先' },
];

const ELECTRIC_COMMON: FieldDef[] = [
  { key: 'company', label: '契約電力会社', layout: 'solo' },
  { key: 'spid', label: '供給地点特定番号', placeholder: '22桁', digits: 22 },
  { key: 'customerNo', label: 'お客様番号' },
  { key: 'address', label: 'でんきの使用住所', kind: 'zipAddress', layout: 'wide' },
  { key: 'capacity', label: '契約容量', layout: 'solo' },
  { key: 'holder', label: '電気契約名義' },
  { key: 'holderKana', label: '電気契約名義(フリガナ)' },
  { key: 'plan', label: '申し込みプラン', kind: 'masterSelect', masterCategory: APPLICATION_PLAN_CATEGORY },
  { key: 'mgmtFee', label: '供給管理費' },
];

export const JURYO_FIELDS: FieldDef[] = [
  ...ELECTRIC_COMMON,
  { key: 'paperBill', label: '紙明細', kind: 'select', options: ['なし', 'あり'] },
  { key: 'billMonth', label: '明細月', format: 'month', placeholder: '例: 2026/09' },
  { key: 'charge', label: '料金', kind: 'yen' },
  { key: 'usage', label: '使用量', kind: 'kwh' },
];

export const DORYOKU_FIELDS: FieldDef[] = [
  ...ELECTRIC_COMMON,
  { key: 'paperBill', label: '紙明細', kind: 'select', options: ['あり', 'なし'] },
  { key: 'billMonth', label: '明細月', format: 'month', placeholder: '例: 2026/09' },
  { key: 'charge', label: '料金', kind: 'yen' },
  { key: 'usage', label: '使用量', kind: 'kwh' },
  { key: 'period', label: '使用期間' },
  { key: 'powerFactor', label: '力率', kind: 'percent' },
];

/**
 * 入力画面での並び(要望: お客様番号と供給地点特定番号を横並び、お客様番号を左)。
 * 全体コピーの書式は変えないため、並べ替えは画面だけ。
 */
export function viewOrder(fields: FieldDef[]): FieldDef[] {
  const i = fields.findIndex((f) => f.key === 'spid');
  const j = fields.findIndex((f) => f.key === 'customerNo');
  if (i < 0 || j < 0 || j < i) return fields;
  const out = [...fields];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export type Section = Record<string, string>;

/** 担当者(要望: 「担当者追加」を押したときだけ使う) */
export const CONTACT_FIELDS: FieldDef[] = [
  { key: 'name', label: '担当者名' },
  { key: 'nameKana', label: '担当者名(カナ)' },
  { key: 'phone', label: '担当者電話番号' },
];

/**
 * 1つの申込情報のデータ。従量・動力は複数契約に対応するため配列で持つ(要望)。
 * 各契約の _key は写真のひも付け用の固定キー(旧データの1件目は 'juryo' / 'doryoku')。
 * juryo / doryoku は複数契約対応前の保存形式(読み込み時に配列へ移す)。
 */
export interface SheetData {
  application: Section;
  hasContact?: boolean;
  contact?: Section;
  juryoList: Section[];
  doryokuList: Section[];
  juryo?: Section;
  doryoku?: Section;
}

export type ElectricKind = 'juryo' | 'doryoku';

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : String(Date.now()));
export const newContract = (kind: ElectricKind): Section => ({ _key: newKey(), ...(kind === 'doryoku' ? { powerFactor: '90' } : {}) });

export const emptySheetData = (): SheetData => ({ application: {}, juryoList: [], doryokuList: [] });

/** 保存済みデータを今の形にそろえる(複数契約対応前のデータも読めるように) */
export function normalizeSheetData(raw: Partial<SheetData> | null | undefined): SheetData {
  const d = raw ?? {};
  const list = (kind: ElectricKind): Section[] => {
    const arr = kind === 'juryo' ? d.juryoList : d.doryokuList;
    if (Array.isArray(arr)) return arr.map((s, i) => ({ ...s, _key: s._key || (i === 0 ? kind : newKey()) }));
    const old = kind === 'juryo' ? d.juryo : d.doryoku;
    return old && Object.keys(old).length ? [{ ...old, _key: kind }] : [];
  };
  return { application: d.application ?? {}, hasContact: !!d.hasContact, contact: d.contact ?? {}, juryoList: list('juryo'), doryokuList: list('doryoku') };
}

/** 郵便番号は「123-4567」に整える */
export function formatZip(v: string | undefined): string {
  const d = (v ?? '').replace(/[^0-9]/g, '');
  return d.length === 7 ? `${d.slice(0, 3)}-${d.slice(3)}` : (v ?? '');
}

const toHalf = (v: string) => v.replace(/[０-９／，．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/**
 * 日付・年月の入力を「/」区切りに整える(要望: 数字だけ入れても「/」が入る)。
 * 自分で「/」を決まった位置以外に入れたとき(1980/1/23 など)はそのまま残す。
 */
export function formatSlashDate(raw: string, kind: 'date' | 'month'): string {
  const v = toHalf(raw);
  const slashAt = kind === 'date' ? [4, 7] : [4];
  if (!/^[\d/]*$/.test(v) || [...v].some((c, i) => c === '/' && !slashAt.includes(i))) return v;
  const d = v.replace(/\//g, '').slice(0, kind === 'date' ? 8 : 6);
  if (d.length <= 4) return d;
  if (kind === 'month' || d.length <= 6) return `${d.slice(0, 4)}/${d.slice(4)}`;
  return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6)}`;
}

/** 入力を終えたら「1980/1/23」「2026年9月」なども 1980/01/23・2026/09 にそろえる */
export function normalizeSlashDate(raw: string, kind: 'date' | 'month'): string {
  const m = /^\s*(\d{4})\s*[/.\-年]\s*(\d{1,2})\s*(?:[/.\-月]\s*(?:(\d{1,2})\s*日?)?)?\s*$/.exec(toHalf(raw));
  if (!m) return raw;
  if (kind === 'month') return m[3] ? raw : `${m[1]}/${m[2].padStart(2, '0')}`;
  return m[3] ? `${m[1]}/${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}` : raw;
}

/** 料金は3桁ごとに「,」を入れる(要望)。数字以外が混じるときはそのまま */
export function formatComma(raw: string): string {
  const v = toHalf(raw).replace(/,/g, '').trim();
  const m = /^(\d+)(\.\d*)?$/.exec(v);
  if (!m) return raw;
  return `${m[1].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${m[2] ?? ''}`;
}

function valueText(f: FieldDef, s: Section): string {
  const v = (s[f.key] ?? '').trim();
  switch (f.kind) {
    case 'zipAddress': {
      const zip = formatZip(s[`${f.key}Zip`]);
      return `〒${zip}${zip && v ? ' ' : ''}${v}`;
    }
    case 'yen':
      return `${v}円`;
    case 'kwh':
      return `${v}kwh`;
    case 'percent':
      return `${v}%`;
    default:
      return v;
  }
}

function sectionText(title: string, fields: FieldDef[], s: Section): string {
  const lines = [`【${title}】`];
  for (const f of fields) {
    if (f.gapBefore) lines.push('');
    lines.push(`${f.bullet ? '・' : ''}${f.label}：${valueText(f, s)}`);
  }
  return lines.join('\n');
}

/**
 * 全体コピー用のテキスト(要望の書式どおり)。
 * 申込情報 →(1行空けて)担当者 → 従量(複数なら 従量情報1, 2…)→ 動力 の順。
 */
export function sheetText(sheet: { inputCode: string | null; hasJuryo: boolean; hasDoryoku: boolean; data: SheetData | Partial<SheetData> }): string {
  const data = normalizeSheetData(sheet.data as Partial<SheetData>);
  let applicationText = sectionText('申込情報', APPLICATION_FIELDS, data.application);
  if (data.hasContact) {
    const c = data.contact ?? {};
    applicationText += `\n\n${CONTACT_FIELDS.map((f) => `${f.label}：${(c[f.key] ?? '').trim()}`).join('\n')}`;
  }
  const parts = [`投入コード：${sheet.inputCode ?? ''}`, applicationText];
  const add = (title: string, fields: FieldDef[], list: Section[]) =>
    list.forEach((s, i) => parts.push(sectionText(list.length > 1 ? `${title}${i + 1}` : title, fields, s)));
  if (sheet.hasJuryo) add('従量情報', JURYO_FIELDS, data.juryoList.length ? data.juryoList : [{}]);
  if (sheet.hasDoryoku) add('動力情報', DORYOKU_FIELDS, data.doryokuList.length ? data.doryokuList : [{ powerFactor: '90' }]);
  return parts.join('\n\n');
}
