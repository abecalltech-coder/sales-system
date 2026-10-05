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

/** MC日(日本時間の日付)の月の4ヶ月後の1日 10:00(日本時間)。読めなければ null */
export function shopSupportDueAt(mcIso: unknown): Date | null {
  if (typeof mcIso !== 'string' || !mcIso) return null;
  const d = new Date(mcIso);
  if (Number.isNaN(d.getTime())) return null;
  const jst = new Date(d.getTime() + 9 * 3600_000); // 日本時間の年月で数える
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + 4, 1, 10 - 9, 0, 0));
}
