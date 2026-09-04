// 色ユーティリティ。マスタで設定された色は濃いことがあるため、
// セル背景・行背景に使うときは白側へ寄せて淡くする(要望)。

export function parseHex(bg: string | null | undefined): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((bg ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** ratio=0で元色、1で白。既定はかなり淡くする。 */
export function pastel(bg: string | null | undefined, ratio = 0.82): string | null {
  const c = parseHex(bg);
  if (!c) return null;
  const mix = (v: number) => Math.round(v + (255 - v) * ratio);
  return `rgb(${mix(c.r)}, ${mix(c.g)}, ${mix(c.b)})`;
}

/** 背景色に対して読みやすい文字色(明るい背景なら黒、暗い背景なら白) */
export function readableTextColor(bg: string | null | undefined): string {
  const c = parseHex(bg);
  if (!c) return '#111827';
  const luminance = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return luminance > 0.62 ? '#111827' : '#ffffff';
}
