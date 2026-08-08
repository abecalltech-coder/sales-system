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
/** "2026-8-10"のような手入力表記も許容し、YYYY-MM-DDへ正規化する(不正な場合はnull) */
export function parseDateText(val: string): string | null {
  const m = val.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const mon = Number(mo);
  const day = Number(d);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
/** "9:5"のような手入力表記も許容し、HH:mmへ正規化する(不正な場合はnull) */
export function parseTimeText(val: string): string | null {
  const m = val.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
