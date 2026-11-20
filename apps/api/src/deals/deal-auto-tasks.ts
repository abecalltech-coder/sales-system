/**
 * 案件から自動で作るタスク(要望)の決まり。
 * 店サポ解約誘導: 「店サポ解約誘導有無」が有 かつ SW日が入ったら、CLのタスクを
 * SW日の月を1ヶ月目と数えた4ヶ月目の1日 10:00(日本時間)に作る(要望: 11月なら2月1日。MC日 から SW日 に変更)。
 */

export const SHOP_SUPPORT_GUIDANCE_KEY = 'shop_support_cancel_guidance';
export const SW_DATE_KEY = 'sw_date';
export const CL_KEY = 'assignee_user_id';
export const APPLICATION_NAME_KEY = 'application_name';
export const CASE_NAME_KEY = 'case_name';

export const SHOP_SUPPORT_TASK = {
  titlePrefix: '【店サポ解約誘導】',
  detail: '無料解約最終月の為必ず連絡して下さい。',
  importance: 5,
};

export const shopSupportTaskKey = (dealId: string) => `deal-shop-support:${dealId}`;

/**
 * ファクタ回収: 「ファクタ回収期日」が入ったら、CLのタスクをその日の 10:00(日本時間)に作る(要望)。
 * 列は画面から追加されたもののため、列名で探す
 */
export const FACTOR_DUE_LABEL = 'ファクタ回収期日';
export const FACTOR_TASK = {
  titlePrefix: '【ファクタ回収】',
  detail: '回収してください。',
  importance: 5,
};
export const factorTaskKey = (dealId: string) => `deal-factor:${dealId}`;

/** 日付の値(日付列のISO、または 2026/10/1・10/1 等の文字)→ その日の 10:00(日本時間)。読めなければ null */
export function dayAt10Jst(value: unknown, now = new Date()): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const t = value.trim().replace(/[０-９／]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  let y: number;
  let m: number;
  let d: number;
  const ymd = t.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  const md = t.match(/^(\d{1,2})[/月](\d{1,2})日?$/);
  if (ymd) [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  else if (md) [y, m, d] = [now.getFullYear(), Number(md[1]), Number(md[2])];
  else {
    const dt = new Date(t);
    if (Number.isNaN(dt.getTime())) return null;
    const jst = new Date(dt.getTime() + 9 * 3600_000);
    [y, m, d] = [jst.getUTCFullYear(), jst.getUTCMonth() + 1, jst.getUTCDate()];
  }
  const out = new Date(Date.UTC(y, m - 1, d, 10 - 9, 0, 0));
  return out.getUTCMonth() === m - 1 ? out : null;
}

/** SW日(日本時間の日付)の月を1ヶ月目とした4ヶ月目の1日 10:00(日本時間)。11月→2月1日。読めなければ null */
export function shopSupportDueAt(sw: unknown, now = new Date()): Date | null {
  const day = dayAt10Jst(sw, now); // 日本時間のその日 10:00(= UTC の同じ日付)。日付の読み方は他の自動タスクとそろえる
  if (!day) return null;
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 3, 1, 10 - 9, 0, 0));
}
