/**
 * 案件から自動で作るタスク(要望)の決まり。
 * 店サポ解約誘導: 「店サポ解約誘導有無」が有 かつ MC日が入ったら、CLのタスクを
 * MC日の月の4ヶ月後の1日 10:00(日本時間)に作る。
 */

export const SHOP_SUPPORT_GUIDANCE_KEY = 'shop_support_cancel_guidance';
export const MC_DATE_KEY = 'mc_date';
export const CL_KEY = 'assignee_user_id';
export const APPLICATION_NAME_KEY = 'application_name';
export const CASE_NAME_KEY = 'case_name';

export const SHOP_SUPPORT_TASK = {
  titlePrefix: '【店サポ解約誘導】',
  detail: '無料解約最終月の為必ず連絡して下さい。',
  importance: 5,
};

export const shopSupportTaskKey = (dealId: string) => `deal-shop-support:${dealId}`;

/** MC日(日本時間の日付)の月の4ヶ月後の1日 10:00(日本時間)。読めなければ null */
export function shopSupportDueAt(mcIso: unknown): Date | null {
  if (typeof mcIso !== 'string' || !mcIso) return null;
  const d = new Date(mcIso);
  if (Number.isNaN(d.getTime())) return null;
  const jst = new Date(d.getTime() + 9 * 3600_000); // 日本時間の年月で数える
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + 4, 1, 10 - 9, 0, 0));
}
