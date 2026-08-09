const DATE_OPTS: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' };
const TIME_OPTS: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' };

export function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('ja-JP', DATE_OPTS) : '-';
}
export function formatTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString('ja-JP', TIME_OPTS) : '-';
}
/** 日付計算用の内部キー(YYYY-MM-DD)。時刻と組み合わせてnew Date()に渡す時など、表示用ではなく機械的な用途に使う */
export function isoToDateKey(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** 「次回対応日」等の手入力欄の表示用。入力方法(-区切り/区切り/区切りなし)によらず月/日の半角/表記に統一する */
export function isoToDateInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
export function isoToTimeInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function isValidMonthDay(mon: number, day: number): boolean {
  return mon >= 1 && mon <= 12 && day >= 1 && day <= 31;
}

/** 全角数字(０-９)を半角に正規化する(IME入力等でどちらで打たれても受け付けるため) */
function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * 手入力の日付表記を幅広く許容し、YYYY-MM-DDへ正規化する(不正な場合はnull)。
 * 対応形式: "2026-8-10" "2026/8/10"(年あり、-または/区切り)
 *          "8-10" "8/10"(年省略、今年として扱う)
 *          "0810"(区切りなし4桁、月日のみとして扱う)
 * 数字は全角で入力されても半角として扱う。
 */
export function parseDateText(val: string): string | null {
  const trimmed = toHalfWidthDigits(val.trim());
  const currentYear = new Date().getFullYear();

  let m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    const mon = Number(mo);
    const day = Number(d);
    if (!isValidMonthDay(mon, day)) return null;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  m = trimmed.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const [, mo, d] = m;
    const mon = Number(mo);
    const day = Number(d);
    if (!isValidMonthDay(mon, day)) return null;
    return `${currentYear}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  m = trimmed.match(/^(\d{2})(\d{2})$/);
  if (m) {
    const [, mo, d] = m;
    const mon = Number(mo);
    const day = Number(d);
    if (!isValidMonthDay(mon, day)) return null;
    return `${currentYear}-${mo}-${d}`;
  }

  return null;
}
/**
 * 手入力の時刻表記を幅広く許容し、半角HH:mmへ正規化する(不正な場合はnull)。
 * 対応形式: "9:5" "9：5"(全角コロン) "0905"(区切りなし4桁)
 * 数字は全角で入力されても半角として扱う。
 */
export function parseTimeText(val: string): string | null {
  const normalized = toHalfWidthDigits(val.trim()).replace(/：/g, ':');
  let m = normalized.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) m = normalized.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
