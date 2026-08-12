// Googleフォームの質問タイトル(項目名)からトス実績への自動反映先を決める対応表(セクション追加要望)。
// 「同じ項目名で拾う」との要望どおり、フォーム側の質問タイトルをここに列挙した名称と合わせるだけで
// マッピング設定なしに反映される。項目名の一覧はマスタ管理側の設定画面にも表示する。

export type GoogleFormFieldKind = 'CUSTOMER_TEXT' | 'TOSS_TEXT' | 'STATUS_LOOKUP' | 'DATE' | 'MEMO_BLOB';

export interface GoogleFormFieldMapEntry {
  aliases: string[];
  kind: GoogleFormFieldKind;
  field: string;
  /** kind=STATUS_LOOKUP のとき、回答文字列をStatusMaster.displayNameとして検索するカテゴリ */
  statusCategory?: string;
}

export const GOOGLE_FORM_FIELD_MAP: GoogleFormFieldMapEntry[] = [
  // 顧客情報(Customer)
  { aliases: ['店舗名', '法人名', '会社名'], kind: 'CUSTOMER_TEXT', field: 'corporateName' },
  { aliases: ['担当者名'], kind: 'CUSTOMER_TEXT', field: 'contactName' },
  { aliases: ['店舗連絡先', '携帯番号', '店舗番号', '電話番号'], kind: 'CUSTOMER_TEXT', field: 'phone' },
  { aliases: ['メールアドレス', 'メール'], kind: 'CUSTOMER_TEXT', field: 'email' },
  { aliases: ['住所 (都道府県から入力必須)', '住所'], kind: 'CUSTOMER_TEXT', field: 'address' },
  { aliases: ['郵便番号'], kind: 'CUSTOMER_TEXT', field: 'postalCode' },

  // トス実績(自由記入項目)
  { aliases: ['案件名'], kind: 'TOSS_TEXT', field: 'caseName' },
  { aliases: ['トス担当者名'], kind: 'TOSS_TEXT', field: 'apStaffName' },
  { aliases: ['提案'], kind: 'TOSS_TEXT', field: 'proposal' },
  { aliases: ['リスト名', 'リスト'], kind: 'TOSS_TEXT', field: 'listName' },
  { aliases: ['架電or入電', '架電／入電'], kind: 'TOSS_TEXT', field: 'callDirection' },
  { aliases: ['業種'], kind: 'TOSS_TEXT', field: 'industry' },
  { aliases: ['フック'], kind: 'TOSS_TEXT', field: 'hook' },
  { aliases: ['既契約'], kind: 'TOSS_TEXT', field: 'existingContract' },
  // 部署はマスタ(CT/CH東/CH西)へ解決せず、フォームの文言をそのまま反映する(要望)。
  { aliases: ['部署'], kind: 'TOSS_TEXT', field: 'department' },

  // マスタ選択肢(回答文字列とStatusMaster.displayNameが一致した場合のみ反映)
  { aliases: ['前確担当者名'], kind: 'STATUS_LOOKUP', field: 'preConfirmStatusId', statusCategory: 'TOSS_PRE_CONFIRM' },

  // 日時(Apps Script側でISO 8601形式に変換して送信する想定)
  { aliases: ['架電希望日時', '次回対応日時', '取り次ぎ日時', '対応日時'], kind: 'DATE', field: 'nextActionAt' },

  // 備考: 店舗番号・オーナー名・SMS送付番号・HP有無・時節・前確架電先番号・デモサイト等をまとめて
  // 1つの回答欄に手入力する運用のため、既知のラベルの直前で改行を入れて整形するだけで、
  // 他の項目のようにDBの個別カラムへは分解しない(セクション追加要望: フォーマットの重複を防ぐ)。
  { aliases: ['備考'], kind: 'MEMO_BLOB', field: 'memo' },
];

export function matchGoogleFormField(label: string): GoogleFormFieldMapEntry | undefined {
  const normalized = label.trim();
  return GOOGLE_FORM_FIELD_MAP.find((entry) => entry.aliases.includes(normalized));
}

// 「備考」欄の中で使われる項目ラベル。スペース区切り・改行区切りのどちらで手入力されていても、
// このラベルの直前に改行を入れることで見た目を統一する。
const MEMO_BLOB_LINE_LABELS = [
  '店舗番号',
  '店舗名',
  '住所',
  '業種',
  'オーナー名',
  'SMS送付番号(オーナー番号)',
  'リスト名',
  'HP有無',
  '時節',
  '備考',
  '前確架電先番号',
  'デモサイト',
];

const MEMO_BLOB_SPLIT_PATTERN = new RegExp(
  `\\s*(?=(?:${MEMO_BLOB_LINE_LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})：)`,
  'g',
);

/**
 * 「店舗番号：xxx 店舗名：xxx …」のように1行にまとめて入力された備考を、ラベル毎に改行して整形する。
 * (ラベル直前の空白除去と、ラベル境界そのものへのゼロ幅マッチが連続することがあるため、
 * 置換後にできる連続改行はまとめて1つに畳む)
 */
export function reformatMemoBlob(raw: string): string {
  return raw
    .trim()
    .replace(MEMO_BLOB_SPLIT_PATTERN, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
