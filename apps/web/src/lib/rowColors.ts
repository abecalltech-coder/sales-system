import type { CSSProperties } from 'react';
import { parseHex, readableTextColor } from './color';

/**
 * 一覧の行の色(要望): マスタ管理で選択肢ごとに「行の塗りつぶし色」と「文字色」を設定でき、
 * 1行に色付きの選択肢が複数あるときは、マスタ管理で上にある項目ほど優先する。
 */
export interface ColoredOption {
  color?: string | null;
  textColor?: string | null;
}

/** 既定の並びに、マスタ管理で保存された並びを反映する(保存に無い項目は既定の位置のまま末尾側へ) */
export function applySavedOrder(defaultKeys: string[], saved: string[] | undefined): string[] {
  if (!saved || saved.length === 0) return defaultKeys;
  const known = new Set(defaultKeys);
  const head = saved.filter((k) => known.has(k));
  const seen = new Set(head);
  return [...head, ...defaultKeys.filter((k) => !seen.has(k))];
}

/**
 * 優先順に並んだ「その行で選ばれている選択肢」から行のスタイルを作る。
 * 塗りつぶしは最初に色を持つ選択肢、文字色は最初に文字色を持つ選択肢(無ければ背景から白/黒を自動)。
 */
export function rowColorStyle(selected: (ColoredOption | undefined | null)[]): CSSProperties | undefined {
  const bg = selected.find((o) => parseHex(o?.color))?.color ?? null;
  const text = selected.find((o) => parseHex(o?.textColor))?.textColor ?? null;
  if (!bg && !text) return undefined;
  return {
    ...(bg ? { background: bg } : {}),
    ...(text ? { color: text } : bg ? { color: readableTextColor(bg) } : {}),
  };
}

/** タブごとのキー(マスタ管理のタブ名と同じ) */
export const MASTER_TAB_KEYS = {
  toss: 'トス実績',
  appointments: 'アポ実績',
  contracts: 'エントリー管理',
  calendar: 'CLカレンダー',
  other: 'その他',
  deals: '案件管理',
} as const;
