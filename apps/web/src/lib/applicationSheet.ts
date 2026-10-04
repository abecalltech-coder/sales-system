/**
 * 申込情報/明細(要望)の項目定義と、全体コピー用のテキスト。
 * テキストの並び・見出し・記号はいただいた書式どおり(「/」のある項目はプルダウン)。
 */

export type FieldKind = 'text' | 'select' | 'zipAddress' | 'yen' | 'kwh' | 'percent';

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
}

export const INPUT_CODES = ['CT', 'CH'];

export const APPLICATION_FIELDS: FieldDef[] = [
  { key: 'name', label: '申し込み名義', bullet: true },
  { key: 'nameKana', label: '申し込み名義(フリガナ)', bullet: true },
  { key: 'address', label: '申し込み住所', kind: 'zipAddress', bullet: true },
  { key: 'repName', label: '代表者名', bullet: true },
  { key: 'repNameKana', label: '代表者名(フリガナ)', bullet: true },
  { key: 'repBirth', label: '代表生年月日', bullet: true, placeholder: '例: 1980/01/23' },
  { key: 'repPhone', label: '代表者電話番号', bullet: true },
  { key: 'storePhone', label: '店舗番号（あれば）', bullet: true },
  { key: 'callbackTime', label: '後確希望時間', bullet: true },
  { key: 'callbackContact', label: '後確連絡先', gapBefore: true },
  { key: 'smsTo', label: 'SMS送付先' },
];

const ELECTRIC_COMMON: FieldDef[] = [
  { key: 'company', label: '契約電力会社' },
  { key: 'spid', label: '供給地点特定番号', placeholder: '22桁' },
  { key: 'customerNo', label: 'お客様番号' },
  { key: 'address', label: 'でんきの使用住所', kind: 'zipAddress' },
  { key: 'capacity', label: '契約容量' },
  { key: 'holder', label: '電気契約名義' },
  { key: 'holderKana', label: '電気契約名義(フリガナ)' },
  { key: 'plan', label: '申し込みプラン' },
  { key: 'mgmtFee', label: '供給管理費' },
];

export const JURYO_FIELDS: FieldDef[] = [
  ...ELECTRIC_COMMON,
  { key: 'paperBill', label: '紙明細', kind: 'select', options: ['なし', 'あり'] },
  { key: 'billMonth', label: '明細月' },
  { key: 'charge', label: '料金', kind: 'yen' },
  { key: 'usage', label: '使用量', kind: 'kwh' },
];

export const DORYOKU_FIELDS: FieldDef[] = [
  ...ELECTRIC_COMMON,
  { key: 'paperBill', label: '紙明細', kind: 'select', options: ['あり', 'なし'] },
  { key: 'billMonth', label: '明細月' },
  { key: 'charge', label: '料金', kind: 'yen' },
  { key: 'usage', label: '使用量', kind: 'kwh' },
  { key: 'period', label: '使用期間' },
  { key: 'powerFactor', label: '力率', kind: 'percent' },
];

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
