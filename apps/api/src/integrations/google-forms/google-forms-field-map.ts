// Googleフォームの質問タイトル(項目名)からトス実績への自動反映先を決める対応表(セクション追加要望)。
// 「同じ項目名で拾う」との要望どおり、フォーム側の質問タイトルをここに列挙した名称と合わせるだけで
// マッピング設定なしに反映される。項目名の一覧はマスタ管理側の設定画面にも表示する。

export type GoogleFormFieldKind = 'CUSTOMER_TEXT' | 'TOSS_TEXT' | 'STATUS_LOOKUP' | 'DATE' | 'MEMO_TOKEN';

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
  { aliases: ['トス担当者名', 'アポインター', 'AP'], kind: 'TOSS_TEXT', field: 'apStaffName' },
  { aliases: ['提案'], kind: 'TOSS_TEXT', field: 'proposal' },
  { aliases: ['リスト名', 'リスト'], kind: 'TOSS_TEXT', field: 'listName' },
  { aliases: ['架電or入電', '架電／入電'], kind: 'TOSS_TEXT', field: 'callDirection' },
  { aliases: ['業種'], kind: 'TOSS_TEXT', field: 'industry' },
  { aliases: ['フック'], kind: 'TOSS_TEXT', field: 'hook' },
  { aliases: ['既契約'], kind: 'TOSS_TEXT', field: 'existingContract' },
  // 部署はマスタ(CT/CH東/CH西)へ解決せず、フォームの文言をそのまま反映する(要望)。
  { aliases: ['部署'], kind: 'TOSS_TEXT', field: 'department' },

  // マスタ選択肢(回答文字列とStatusMaster.displayNameが一致した場合のみ反映)
  { aliases: ['前確担当者名', '前確者', '前確'], kind: 'STATUS_LOOKUP', field: 'preConfirmStatusId', statusCategory: 'TOSS_PRE_CONFIRM' },

  // 日時(Apps Script側でISO 8601形式に変換して送信する想定)
  { aliases: ['架電希望日時', '次回対応日時', '取り次ぎ日時', '対応日時'], kind: 'DATE', field: 'nextActionAt' },

  // 備考欄の組み立てにのみ使う項目(対応するDBカラムを持たず、テンプレートのトークンとして差し込む)
  { aliases: ['オーナー名'], kind: 'MEMO_TOKEN', field: 'ownerName' },
  { aliases: ['SMS送付番号(オーナー番号)', 'SMS送付番号'], kind: 'MEMO_TOKEN', field: 'smsNumber' },
  { aliases: ['HP有無'], kind: 'MEMO_TOKEN', field: 'hpStatus' },
  { aliases: ['時節'], kind: 'MEMO_TOKEN', field: 'season' },
  { aliases: ['備考'], kind: 'MEMO_TOKEN', field: 'memo' },
  { aliases: ['前確架電先番号'], kind: 'MEMO_TOKEN', field: 'preConfirmPhone' },
  { aliases: ['デモサイト'], kind: 'MEMO_TOKEN', field: 'demoSite' },
];

export function matchGoogleFormField(label: string): GoogleFormFieldMapEntry | undefined {
  const normalized = label.trim();
  return GOOGLE_FORM_FIELD_MAP.find((entry) => entry.aliases.includes(normalized));
}
