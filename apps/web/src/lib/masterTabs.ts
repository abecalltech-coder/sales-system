import { applySavedOrder } from './rowColors';

export interface CategoryDef {
  value: string;
  label: string;
  /** 複数画面で使う項目。ここで編集すると全画面に反映される */
  shared?: boolean;
}

/**
 * マスタ管理の画面ごとのタブと、その中の項目(カード)。並びは既定の優先順で、
 * マスタ管理で並び替えた結果(system-settings masterCardOrder)が上書きする。
 * 上にある項目ほど一覧の行の塗りつぶし・文字色が優先される(要望)。
 * 同じ項目(部署・商談形式・前確・業種など)は複数タブに出るが、中身は共通で連動する。
 */
export const MASTER_TAB_GROUPS: { title: string; categories: CategoryDef[] }[] = [
  {
    title: 'トス実績',
    categories: [
      { value: 'TOSS_PROGRESS', label: '進捗(状況 / ステータス兼用)' },
      { value: 'TOSS_NG_REASON', label: 'NG理由' },
      { value: 'MEETING_FORMAT', label: '商談形式(フック)', shared: true },
      { value: 'TOSS_PRE_CONFIRM', label: '前確担当者', shared: true },
      { value: 'DEPARTMENT_BRANCH', label: '部署(CT/CH東/CH西)', shared: true },
      { value: 'INDUSTRY', label: '業種', shared: true },
      { value: 'EXISTING_CONTRACT', label: '既契約', shared: true },
      { value: 'PROPOSAL_LOCATION', label: '提案(場所)', shared: true },
    ],
  },
  {
    title: 'アポ実績',
    categories: [
      { value: 'APPOINTMENT_PROGRESS', label: '進捗' },
      { value: 'MEETING_FORMAT', label: '商談形式(フック)', shared: true },
      { value: 'TOSS_PRE_CONFIRM', label: '前確担当者', shared: true },
      { value: 'APPOINTMENT_PRE_CONTACT', label: '前連担当' },
      { value: 'APPOINTMENT_CLOSER', label: 'CL(クロージング担当)', shared: true },
      { value: 'DEPARTMENT_BRANCH', label: '部署(CT/CH東/CH西)', shared: true },
      { value: 'INDUSTRY', label: '業種', shared: true },
      { value: 'EXISTING_CONTRACT', label: '既契約', shared: true },
      { value: 'PROPOSAL_LOCATION', label: '提案場所', shared: true },
      { value: 'APPOINTMENT', label: '商談ステータス' },
      { value: 'APPOINTMENT_HP_PROGRESS', label: 'HP進捗' },
      { value: 'APPOINTMENT_TYPE', label: '種別' },
      { value: 'APPOINTMENT_ACQUISITION_METHOD', label: '獲得方法' },
      { value: 'APPOINTMENT_ANSHIN_BIZ_STATUS', label: 'あんしんBiz' },
      { value: 'APPOINTMENT_ANSHIN_BIZ_LOST_REASON', label: 'あんしんBiz失注理由' },
      { value: 'APPOINTMENT_MOBILE_STATUS', label: 'モバイル' },
      { value: 'APPOINTMENT_MOBILE_LOST_REASON', label: 'モバイル失注理由' },
      { value: 'APPOINTMENT_FUNFO_STATUS', label: 'funfo' },
      { value: 'APPOINTMENT_FUNFO_LOST_REASON', label: 'funfo失注理由' },
      { value: 'APPOINTMENT_CONSENT_FORM_TYPE', label: '同意書種別' },
      { value: 'APPOINTMENT_DELIVERY_METHOD', label: '交付方法' },
      { value: 'APPOINTMENT_DELIVERY_STATUS', label: '交付状況' },
      { value: 'VISIT', label: '訪問ステータス' },
    ],
  },
  {
    title: 'エントリー管理',
    categories: [{ value: 'MATCHING', label: 'マッチング状況' }],
  },
  {
    title: 'CLカレンダー',
    categories: [
      { value: 'DEPARTMENT_BRANCH', label: '部署(予定の色分けにも使用)', shared: true },
      { value: 'APPOINTMENT_CLOSER', label: 'CL(クロージング担当)', shared: true },
      { value: 'MEETING_FORMAT', label: '商談形式(フック / 題名の【】に入る)', shared: true },
    ],
  },
  {
    title: 'その他',
    categories: [
      {
        value: 'TOSS_HOOK_LABEL_MAP',
        label: 'Googleフォームのフック文言 → 商談形式の変換(内部コード=フォームの原文、表示名=変換後)',
      },
    ],
  },
];

/** 部署の色はCLカレンダーの予定の色なので、一覧の行の色には使わない */
const NOT_ROW_COLOR = new Set(['DEPARTMENT_BRANCH', 'TOSS_HOOK_LABEL_MAP', 'VISIT']);

/** タブの項目を、マスタ管理で並び替えた順(=行の色の優先順)で返す */
export function orderedCategories(tabTitle: string, saved: Record<string, string[]> | undefined): CategoryDef[] {
  const group = MASTER_TAB_GROUPS.find((g) => g.title === tabTitle);
  if (!group) return [];
  const keys = applySavedOrder(
    group.categories.map((c) => c.value),
    saved?.[tabTitle],
  );
  return keys.map((k) => group.categories.find((c) => c.value === k)!);
}

/** 行の色の優先順に並んだカテゴリ(色に使わない項目は除く) */
export function rowColorCategories(tabTitle: string, saved: Record<string, string[]> | undefined): string[] {
  return orderedCategories(tabTitle, saved)
    .map((c) => c.value)
    .filter((v) => !NOT_ROW_COLOR.has(v));
}
