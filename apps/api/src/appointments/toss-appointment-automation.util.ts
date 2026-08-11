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

/**
 * カレンダー予定のタイトルを組み立てる。
 * 例: "CT 東【HPZOOM】〇〇商店" / フックに"シュミ"を含む場合は "CT シュミ東【HPZOOM】〇〇商店"
 */
export function buildCalendarTitle(params: {
  departmentLabel: string;
  prefecture: string | null;
  hookLabel: string;
  isShumi: boolean;
  storeName: string;
}): string {
  const prefectureInitial = params.prefecture ? params.prefecture.slice(0, 1) : '';
  const shumiPrefix = params.isShumi ? 'シュミ' : '';
  return `${params.departmentLabel} ${shumiPrefix}${prefectureInitial}【${params.hookLabel}】${params.storeName}`.trim();
}

/** 前連予定用のタイトル。例: "CT 東【前連】〇〇商店" */
export function buildPreContactCalendarTitle(params: { departmentLabel: string; prefecture: string | null; storeName: string }): string {
  const prefectureInitial = params.prefecture ? params.prefecture.slice(0, 1) : '';
  return `${params.departmentLabel} ${prefectureInitial}【前連】${params.storeName}`.trim();
}

/** テンプレート文字列中の{{token}}をtokensの値に置換する(未指定のtokenは空文字扱い) */
export function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => tokens[key] ?? '');
}
