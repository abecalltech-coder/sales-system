/**
 * マスタの「共通」のオン/オフ(要望)。
 * 共通の項目(商談形式・前確・業種など)はトス実績とアポ実績で同じ選択肢を使うが、オフにすると
 * アポ実績(CLカレンダーはアポのデータを表示するので同じ扱い)は「<カテゴリ>@APPOINTMENT」の
 * 独立した選択肢を使う。トス実績は元のカテゴリのまま。
 */
export const SHARE_SETTING_KEY = 'masterShareOff';
export const APPOINTMENT_SCOPE_SUFFIX = '@APPOINTMENT';

/** オン/オフを切り替えられる共通項目 */
export const SPLITTABLE_CATEGORIES = ['MEETING_FORMAT', 'TOSS_PRE_CONFIRM', 'INDUSTRY', 'EXISTING_CONTRACT', 'PROPOSAL_LOCATION'] as const;

export const appointmentScoped = (category: string) => `${category}${APPOINTMENT_SCOPE_SUFFIX}`;

/**
 * 独立させたときに、アポ側の既存データが「選択肢のID」を持っている項目(付け替えが必要)。
 * 業種などは表示名そのものを保存しているので付け替え不要。
 */
export const APPOINTMENT_ID_FIELDS: Partial<Record<string, 'preConfirmStatusId'>> = {
  TOSS_PRE_CONFIRM: 'preConfirmStatusId',
};
