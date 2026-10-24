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
  /** 提案が自宅なら【フック】の前に★を付ける(要望) */
  home?: boolean;
}): string {
  const prefectureInitial = params.prefecture ? params.prefecture.slice(0, 1) : '';
  const head = [params.departmentLabel, params.closerSurname, prefectureInitial].map((s) => (s ?? '').trim()).filter(Boolean);
  return `${head.join(' ')} ${params.home ? '★' : ''}【${params.hook}】${params.storeName}`.replace(/\s+/g, ' ').trim();
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
  // アポ登録フォームの入力(トスからのアポ変換では空)
  携帯番号: 'mobilePhone',
  担当者年齢: 'contactAge',
  性別: 'contactGender',
  利用電気: 'electricity',
  料金: 'charge',
  明細: 'billPrep',
  法人or屋号: 'corporateType',
  対象外確認: 'outOfScope',
  地点数従量: 'pointsJuryo',
  地点数動力: 'pointsDoryoku',
  提案: 'proposal',
  SMS送付番号: 'smsTo',
  店舗HP: 'storeHp',
  最寄り駅: 'nearestStation',
  徒歩分数: 'walkMinutes',
};

/** フックが HPZOOM(オンライン)か。自由入力のため全角・小文字・空白の違いは無視する */
export function isOnlineHook(hook: string | null | undefined): boolean {
  return (hook ?? '').normalize('NFKC').replace(/\s/g, '').toUpperCase() === 'HPZOOM';
}

/** テンプレート文字列中の{{項目}}をtokensの値に置換する。{{店舗名}}のような日本語名と{{storeName}}の両方に対応(未指定は空文字) */
export function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, name: string) => {
    const key = TEMPLATE_FIELD_ALIASES[name] ?? name;
    return tokens[key] ?? '';
  });
}

/** アポ登録フォームの入力値 */
export interface ApoFormMemoInput {
  contactName?: string;
  existingContract?: string;
  mobilePhone?: string;
  contactAge?: string;
  contactGender?: string;
  charge?: string;
  billPrep?: string;
  corporateType?: string;
  outOfScope?: string;
  pointsJuryo?: string;
  pointsDoryoku?: string;
  proposal?: string;
  smsTo?: string;
  storeHp?: string;
  nearestStation?: string;
  walkMinutes?: string;
}

/** アポ登録フォームの入力を {{携帯番号}} などの差し込み項目にする */
export function apoFormTokens(i: ApoFormMemoInput): Record<string, string> {
  return {
    mobilePhone: i.mobilePhone ?? '',
    contactAge: i.contactAge ?? '',
    contactGender: i.contactGender ?? '',
    electricity: i.existingContract ?? '',
    charge: i.charge ?? '',
    billPrep: i.billPrep ?? '',
    corporateType: i.corporateType ?? '',
    outOfScope: i.outOfScope ?? '',
    pointsJuryo: i.pointsJuryo ?? '',
    pointsDoryoku: i.pointsDoryoku ?? '',
    proposal: i.proposal ?? '',
    smsTo: i.smsTo ?? '',
    storeHp: i.storeHp ?? '',
    nearestStation: i.nearestStation ?? '',
    walkMinutes: i.walkMinutes ?? '',
  };
}

/**
 * アポ詳細FMTには「携帯番号：」「料金：」のように差し込み項目の無い行が多いため、
 * 見出し(「：」の前)が一致する行の値をアポ登録フォームの入力で埋める(入力が無い行はFMTのまま)。
 */
export function fillApoFormLines(text: string, i: ApoFormMemoInput): string {
  if (!text) return text;
  const age = (i.contactAge ?? '').replace(/歳$/, '');
  const fills: [RegExp, (cur: string) => string | null][] = [
    [/^携帯番号$/, () => i.mobilePhone || null],
    [/^利用電気$/, () => i.existingContract || null],
    [/^料金$/, () => i.charge || null],
    [/^明細(準備)?$/, () => i.billPrep || null],
    [/^法人or屋号$/, () => i.corporateType || null],
    [/^対象外(確認)?$/, () => i.outOfScope || null],
    [/^提案$/, () => i.proposal || null],
    [/^SMS送付番号/, () => i.smsTo || null],
    [/^店舗HP/, () => i.storeHp || null],
    [
      /^最寄り?駅$/,
      () => {
        if (!i.nearestStation && !i.walkMinutes) return null;
        const station = (i.nearestStation ?? '').replace(/駅$/, '');
        const min = (i.walkMinutes ?? '').replace(/分$/, '');
        return `${station}駅　徒歩${min}分`;
      },
    ],
    [/^地点数$/, () => (i.pointsJuryo || i.pointsDoryoku ? `従量（${i.pointsJuryo ?? ''}地点）/動力（${i.pointsDoryoku ?? ''}地点）` : null)],
    [
      /^担当者名$/,
      (cur) => {
        if (!age && !i.contactGender) return null;
        const name = (i.contactName || cur.split(/様|　/)[0] || '').trim();
        return `${name}様　${age}歳前後　${i.contactGender || '男性/女性'}`;
      },
    ],
  ];
  return text
    .split('\n')
    .map((line) => {
      const m = /^(【[^】]*】)?([^：]+)：(.*)$/.exec(line);
      if (!m) return line;
      const hit = fills.find(([re]) => re.test(m[2].trim()));
      const v = hit?.[1](m[3]);
      return v ? `${m[1] ?? ''}${m[2]}：${v}` : line;
    })
    .join('\n');
}

/** 提案が自宅のときの印: 本文の一番最初の【(例:【HPZOOM】)の前に★を付ける。【が無ければ先頭に付ける */
export function markHomeProposal(text: string): string {
  const idx = text.indexOf('【');
  return idx >= 0 ? `${text.slice(0, idx)}★${text.slice(idx)}` : `★${text}`;
}
