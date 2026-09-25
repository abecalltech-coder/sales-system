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
 * CL担当の表示名から名字だけを取り出す。表示側 lib/calendarTitle.ts と規則を揃えること。
 * 区切り(空白/中黒/カンマ/読点)前を採用。区切りが無く漢字4文字なら前2文字。それ以外はそのまま。
 */
export function closerSurname(closerDisplayName: string | null | undefined): string {
  if (!closerDisplayName) return '';
  const name = closerDisplayName.trim();
  const head = name.split(/[\s　・,、]+/)[0];
  if (head && head !== name) return head;
  if (/^[一-鿿々]{4}$/.test(name)) return name.slice(0, 2);
  return name;
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

/**
 * アポ詳細FMTの差し込み項目の日本語名 → 内部キー(要望: コードではなく日本語で直感的に書けるように)。
 * マスタ管理の画面(web: MastersAdminPage の TEMPLATE_FIELDS)と名称を揃えること。
 */
export const TEMPLATE_FIELD_ALIASES: Record<string, string> = {
  獲得角度: 'acquisitionAngle',
  取り次ぎ日時: 'nextActionAt',
  商談日時: 'meetingAt',
  店舗名: 'storeName',
  住所: 'address',
  業種: 'industry',
  店舗連絡先: 'storePhone',
  担当者名: 'contactName',
  アポインター: 'apStaffName',
  前確者: 'preConfirmName',
  リスト名: 'listName',
  前連日時: 'preContactAt',
  フック: 'hook',
  GoogleMeetURL: 'meetingUrl',
};

/** テンプレート文字列中の{{項目}}をtokensの値に置換する。{{店舗名}}のような日本語名と{{storeName}}の両方に対応(未指定は空文字) */
export function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, name: string) => {
    const key = TEMPLATE_FIELD_ALIASES[name] ?? name;
    return tokens[key] ?? '';
  });
}
