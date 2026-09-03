// CLカレンダーの予定タイトルの組み立て規則。
// サーバー側 apps/api/src/appointments/toss-appointment-automation.util.ts と揃えること。
// 例: "CT 東【HPZOOM】〇〇商店"

export function buildCalendarTitle(params: {
  departmentLabel: string;
  prefecture: string | null;
  bracketLabel: string;
  storeName: string;
}): string {
  const prefectureInitial = params.prefecture ? params.prefecture.slice(0, 1) : '';
  return `${params.departmentLabel} ${prefectureInitial}【${params.bracketLabel}】${params.storeName}`.replace(/\s+/g, ' ').trim();
}

export function buildPreContactTitle(params: {
  departmentLabel: string;
  prefecture: string | null;
  storeName: string;
}): string {
  const prefectureInitial = params.prefecture ? params.prefecture.slice(0, 1) : '';
  return `${params.departmentLabel} ${prefectureInitial}【前連】${params.storeName}`.replace(/\s+/g, ' ').trim();
}
