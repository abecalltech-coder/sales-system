const DATE_OPTS: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' };
const TIME_OPTS: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' };

export function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('ja-JP', DATE_OPTS) : '-';
}
export function formatTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString('ja-JP', TIME_OPTS) : '-';
}
export function isoToDateInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

/**
 * 手入力の日付表記を幅広く許容し、YYYY-MM-DDへ正規化する(不正な場合はnull)。
 * 対応形式: "2026-8-10" "2026/8/10"(年あり、-または/区切り)
 *          "8-10" "8/10"(年省略、今年として扱う)
 *          "0810"(区切りなし4桁、月日のみとして扱う)
 */
export function parseDateText(val: string): string | null {
  const trimmed = val.trim();
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
/** "9:5" "9：5"(全角コロン)のような手入力表記も許容し、HH:mmへ正規化する(不正な場合はnull) */
export function parseTimeText(val: string): string | null {
  const normalized = val.trim().replace(/：/g, ':');
  const m = normalized.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
