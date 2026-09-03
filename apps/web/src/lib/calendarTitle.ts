// CLカレンダーの予定タイトルの組み立て規則。
// サーバー側 apps/api/src/appointments/toss-appointment-automation.util.ts と揃えること。
// 規則: 「部署名 半角スペース CL名字 半角スペース 都道府県頭文字 半角スペース 【フック】店舗名」
// 例: "CT 山田 東【HPZOOM】〇〇商店"

/**
 * CL担当の表示名から名字だけを取り出す。
 * - 区切り(半角/全角スペース・中黒・カンマ・読点)があればその前を採用: 「山田 太郎」→「山田」
 * - 区切りが無く漢字4文字なら前2文字(姓2+名2の想定): 「山田太郎」→「山田」
 * - それ以外(2〜3文字や5文字以上)は判別不能なのでそのまま
 * 想定外は マスタ管理 > CL で「姓 名」または姓だけに直してもらう。
 */
export function closerSurname(closerDisplayName: string | null | undefined): string {
  if (!closerDisplayName) return '';
  const name = closerDisplayName.trim();
  const head = name.split(/[\s　・,、]+/)[0];
  if (head && head !== name) return head;
  if (/^[一-鿿々]{4}$/.test(name)) return name.slice(0, 2);
  return name;
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
