// Googleフォームの質問タイトル(項目名)からトス実績への自動反映先を決める対応表(セクション追加要望)。
// 「同じ項目名で拾う」との要望どおり、フォーム側の質問タイトルをここに列挙した名称と合わせるだけで
// マッピング設定なしに反映される。項目名の一覧はマスタ管理側の設定画面にも表示する。

export type GoogleFormFieldKind = 'CUSTOMER_TEXT' | 'TOSS_TEXT' | 'STATUS_LOOKUP' | 'DATE';

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
  { aliases: ['携帯番号', '店舗番号', '電話番号'], kind: 'CUSTOMER_TEXT', field: 'phone' },
  { aliases: ['メールアドレス', 'メール'], kind: 'CUSTOMER_TEXT', field: 'email' },
  { aliases: ['住所'], kind: 'CUSTOMER_TEXT', field: 'address' },
  { aliases: ['郵便番号'], kind: 'CUSTOMER_TEXT', field: 'postalCode' },

  // トス実績(自由記入項目)
  { aliases: ['案件名'], kind: 'TOSS_TEXT', field: 'caseName' },
  { aliases: ['アポインター', 'AP'], kind: 'TOSS_TEXT', field: 'apStaffName' },
  { aliases: ['提案'], kind: 'TOSS_TEXT', field: 'proposal' },
  { aliases: ['リスト名', 'リスト'], kind: 'TOSS_TEXT', field: 'listName' },
  { aliases: ['架電or入電', '架電／入電'], kind: 'TOSS_TEXT', field: 'callDirection' },
  { aliases: ['業種'], kind: 'TOSS_TEXT', field: 'industry' },
  { aliases: ['フック'], kind: 'TOSS_TEXT', field: 'hook' },
  { aliases: ['既契約'], kind: 'TOSS_TEXT', field: 'existingContract' },
  { aliases: ['備考'], kind: 'TOSS_TEXT', field: 'memo' },

  // マスタ選択肢(回答文字列とStatusMaster.displayNameが一致した場合のみ反映)
  { aliases: ['部署'], kind: 'STATUS_LOOKUP', field: 'department', statusCategory: 'DEPARTMENT_BRANCH' },
  { aliases: ['前確者', '前確'], kind: 'STATUS_LOOKUP', field: 'preConfirmStatusId', statusCategory: 'TOSS_PRE_CONFIRM' },

  // 日時(Apps Script側でISO 8601形式に変換して送信する想定)
  { aliases: ['次回対応日時', '取り次ぎ日時', '対応日時'], kind: 'DATE', field: 'nextActionAt' },
];

export function matchGoogleFormField(label: string): GoogleFormFieldMapEntry | undefined {
  const normalized = label.trim();
  return GOOGLE_FORM_FIELD_MAP.find((entry) => entry.aliases.includes(normalized));
}
