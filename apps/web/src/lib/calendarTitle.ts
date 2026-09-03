// CLカレンダーの予定タイトルの組み立て規則。
// サーバー側 apps/api/src/appointments/toss-appointment-automation.util.ts と揃えること。
// 規則: 「部署名 半角スペース CL名字 半角スペース 都道府県頭文字 半角スペース 【フック】店舗名」
// 例: "CT 山田 東【HPZOOM】〇〇商店"

/** CL担当の表示名から名字だけ(半角/全角スペース区切りの先頭) */
export function closerSurname(closerDisplayName: string | null | undefined): string {
  if (!closerDisplayName) return '';
  return closerDisplayName.trim().split(/[\s　]+/)[0] ?? '';
}

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

export function buildPreContactTitle(params: {
  departmentLabel: string;
  closerSurname: string;
  prefecture: string | null;
  storeName: string;
}): string {
  const prefectureInitial = params.prefecture ? params.prefecture.slice(0, 1) : '';
  const head = [params.departmentLabel, params.closerSurname, prefectureInitial].map((s) => (s ?? '').trim()).filter(Boolean);
  return `${head.join(' ')} 【前連】${params.storeName}`.replace(/\s+/g, ' ').trim();
}
