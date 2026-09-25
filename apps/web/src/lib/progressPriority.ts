import type { StatusMasterItem } from '../hooks/useApi';

/**
 * トス実績・アポ実績の自動並び(進捗グループの表示優先順位)。
 * マスタの order ではなく要望の固定順で並べる。マスタ管理で追加された値にも効くよう
 * internalCode に加えて表示名でも照合する。どれにも当たらない進捗は NG の直前に置く。
 */
interface PriorityGroup {
  codes?: string[];
  names?: string[];
  /** 表示名がこれを含めば該当(失注系など) */
  includes?: string[];
  /** 進捗未設定の行をこのグループとして扱う */
  includesEmpty?: boolean;
}

// 前確OK → 折り返し待ち → メール対応中 → 新規/追い/不在 → (その他) → NG
const TOSS_GROUPS: PriorityGroup[] = [
  { codes: ['PROGRESS_PRE_CONFIRM_OK'], names: ['前確OK'] },
  { codes: ['PROGRESS_CALLBACK_WAIT'], names: ['折り返し待ち'] },
  { codes: ['PROGRESS_EMAIL_IN_PROGRESS'], names: ['メール対応中'] },
  {
    codes: ['PROGRESS_NEW', 'PROGRESS_FOLLOWING', 'PROGRESS_ABSENT'],
    names: ['新規', '追い', '追い中', '不在'],
    includesEmpty: true,
  },
  { codes: ['PROGRESS_NG'], names: ['NG'] },
];

// ET → 成約 → 保留A → 保留B → 新規 → (その他) → NG(失注系)
const APPOINTMENT_GROUPS: PriorityGroup[] = [
  { codes: ['PROG_ET'], names: ['ET'] },
  { codes: ['PROG_CONTRACTED'], names: ['成約'] },
  { codes: ['PROG_HOLD_A'], names: ['保留A'] },
  { codes: ['PROG_HOLD_B'], names: ['保留B'] },
  { codes: ['PROG_NEW_VISIT'], names: ['新規', '新規訪問'], includesEmpty: true },
  { codes: [], names: ['NG'], includes: ['NG', '失注'] },
];

function matches(g: PriorityGroup, s: StatusMasterItem): boolean {
  if (g.codes?.includes(s.internalCode)) return true;
  const name = s.displayName.trim();
  if (g.names?.includes(name)) return true;
  return !!g.includes?.some((w) => name.includes(w));
}

function makeRank(groups: PriorityGroup[]) {
  const last = groups.length - 1; // NG は常に最後のグループ
  return (options: StatusMasterItem[] | undefined, id: string | null | undefined): number => {
    const s = id ? options?.find((o) => o.id === id) : undefined;
    if (!s) {
      const emptyIdx = groups.findIndex((g) => g.includesEmpty);
      return emptyIdx >= 0 ? emptyIdx * 1000 : last * 1000 - 1;
    }
    const idx = groups.findIndex((g) => matches(g, s));
    // 未分類の進捗は NG の直前。その中ではマスタの order 順
    if (idx < 0) return (last - 1) * 1000 + 500 + Math.min(Math.max(s.order ?? 0, 0), 499);
    return idx * 1000;
  };
}

export const tossProgressRank = makeRank(TOSS_GROUPS);
export const appointmentProgressRank = makeRank(APPOINTMENT_GROUPS);

/** グループ順 → 日時昇順(日時なしはグループ末尾) */
export function compareByRankThenTime(rankA: number, rankB: number, isoA: string | null | undefined, isoB: string | null | undefined): number {
  if (rankA !== rankB) return rankA - rankB;
  const at = isoA ? new Date(isoA).getTime() : Infinity;
  const bt = isoB ? new Date(isoB).getTime() : Infinity;
  if (at === bt) return 0;
  return at - bt;
}
