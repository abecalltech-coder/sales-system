// トス→アポイント自動作成時のカレンダー題名・色・備考テンプレート生成ロジック(セクション追加要望)

/** "8/11（火）14:30"形式。時刻未設定の場合は空文字。 */
export function formatJaDateTimeWithWeekday(date: Date | null | undefined): string {
  if (!date) return '';
  const fmt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.month}/${parts.day}（${parts.weekday}）${parts.hour}:${parts.minute}`;
}

/** CL担当の表示名から名字だけを取り出す(半角/全角スペース区切りの先頭) */
export function closerSurname(closerDisplayName: string | null | undefined): string {
  if (!closerDisplayName) return '';
  return closerDisplayName.trim().split(/[\s　]+/)[0] ?? '';
}

/**
 * カレンダー予定のタイトルを組み立てる。表示側(CLカレンダー)でも同じ規則で
 * 都度組み立てるため、規則を変えるときはフロントの lib/calendarTitle.ts も揃える。
 * 規則(要望): 「部署名 半角スペース CL名字 半角スペース 都道府県頭文字 半角スペース 【フック】店舗名」
 * 例: "CT 山田 東【HPZOOM】〇〇商店"
 */
export function buildCalendarTitle(params: {
  departmentLabel: string;
  closerSurname: string;
  prefecture: string | null;
  hook: string;
  storeName: string;
}): string {
  const prefectureInitial = params.prefecture ? params.prefecture.slice(0, 1) : '';
  const head = [params.departmentLabel, params.closerSurname, prefectureInitial].map((s) => (s ?? '').trim()).filter(Boolean);
  return `${head.join(' ')} 【${params.hook}】${params.storeName}`.replace(/\s+/g, ' ').trim();
}

/** 前連予定用のタイトル。例: "CT 山田 東【前連】〇〇商店" */
export function buildPreContactCalendarTitle(params: {
  departmentLabel: string;
  closerSurname: string;
  prefecture: string | null;
  storeName: string;
}): string {
  const prefectureInitial = params.prefecture ? params.prefecture.slice(0, 1) : '';
  const head = [params.departmentLabel, params.closerSurname, prefectureInitial].map((s) => (s ?? '').trim()).filter(Boolean);
  return `${head.join(' ')} 【前連】${params.storeName}`.replace(/\s+/g, ' ').trim();
}

/** テンプレート文字列中の{{token}}をtokensの値に置換する(未指定のtokenは空文字扱い) */
export function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => tokens[key] ?? '');
}
