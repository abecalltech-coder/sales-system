/**
 * 案件管理の「シートから更新」(要望): Googleスプレッドシートの表を読み、
 * 一括投入と同じ決まりで案件へ反映する(手打ち・システム内で入れた値は上書きしない)。
 */

/** スプレッドシートのURLから ID とシート(gid)を取り出す */
export function parseSheetUrl(url: string): { spreadsheetId: string; gid: number | null } | null {
  const m = url.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const g = url.match(/[#&?]gid=(\d+)/);
  return { spreadsheetId: m[1], gid: g ? Number(g[1]) : null };
}

const toHalf = (s: string) => s.replace(/[０-９／－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** シートの日付表記(2026/10/1, 2026-10-01, 2026年10月1日, 10/1)を YYYY-MM-DD に。読めなければ null */
export function parseSheetDate(raw: string, now = new Date()): string | null {
  const t = toHalf(raw.trim()).replace(/\s.*$/, ''); // 時刻が付いていても日付だけ
  let y: number;
  let mo: number;
  let d: number;
  let m = t.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = t.match(/^(\d{1,2})[-/月](\d{1,2})日?$/))) [y, mo, d] = [now.getFullYear(), Number(m[1]), Number(m[2])];
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 一括投入(画面)と同じ保存形式: 日本時間のその日の0時 */
export const dateToStored = (ymd: string) => new Date(`${ymd}T00:00:00+09:00`).toISOString();

/** 見出し行を探す(先頭の空行は飛ばす)。対応表にある列名が最も多い行を見出しとみなす */
export function findHeaderRow(table: string[][], mappedHeaders: string[]): number {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const cells = table[i].map((c) => c.trim());
    const score = mappedHeaders.length ? mappedHeaders.filter((h) => cells.includes(h)).length : cells.filter(Boolean).length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
