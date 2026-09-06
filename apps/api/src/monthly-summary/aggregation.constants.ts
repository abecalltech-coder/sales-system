/**
 * 月次サマリー実績表(31列)の列定義。
 *
 * kind:
 *  - 'manual'   : 手入力のみ(予算・コール数・稼働時間・席数など)
 *  - 'auto'     : トス/アポ/エントリー実績から自動集計。セル編集で上書き可(values[code] が上書き値)
 *  - 'computed' : 常に他列から自動計算(保存しない)
 *
 * 自動集計の指標→データ源の対応はまだ確定でない部分がある(前確OK・前連失注・直転送トスは
 * 明確なデータ源が無いため manual)。実データを見て調整する前提。
 */
export type SummaryColumnKind = 'manual' | 'auto' | 'computed';

export interface SummaryColumnDef {
  code: string;
  label: string;
  kind: SummaryColumnKind;
  /** computed 列の計算式(フロントendで評価)。分母0のときは空表示。 */
  formula?: string;
  /** パーセント表示(computed) */
  percent?: boolean;
}

export const SUMMARY_COLUMNS: SummaryColumnDef[] = [
  { code: 'workHours', label: '稼働時間', kind: 'manual' },
  { code: 'headcount', label: '稼働人数', kind: 'manual' },
  { code: 'seats', label: '席数', kind: 'manual' },
  { code: 'tossUpBudget', label: 'トスアップ予算', kind: 'manual' },
  { code: 'preOkBudget', label: '前確OK予算', kind: 'manual' },
  { code: 'meetingBudget', label: '商談実施数予算', kind: 'manual' },
  { code: 'contractBudget', label: '成約拠点数予算', kind: 'manual' },
  { code: 'etBudget', label: 'ET数予算', kind: 'manual' },
  { code: 'sfCalls', label: 'SFコール数', kind: 'manual' },
  { code: 'blankCalls', label: '白地コール数', kind: 'manual' },
  { code: 'totalCalls', label: '合計コール数', kind: 'computed', formula: 'sfCalls + blankCalls' },
  { code: 'dph', label: 'DPH(1時間あたり)', kind: 'computed', formula: 'totalCalls / workHours' },
  { code: 'tossUp', label: 'トスアップ', kind: 'auto' },
  { code: 'directToss', label: '直転送トス', kind: 'manual' },
  { code: 'directRate', label: '直転送比率', kind: 'computed', formula: 'directToss / tossUp', percent: true },
  { code: 'preOk', label: '前確OK', kind: 'manual' },
  { code: 'preOkRate', label: '前確OK通過率', kind: 'computed', formula: 'preOk / tossUp', percent: true },
  { code: 'apo', label: 'アポ', kind: 'auto' },
  { code: 'meetingDone', label: '商談実施数', kind: 'auto' },
  { code: 'meetingRate', label: '商談実施率', kind: 'computed', formula: 'meetingDone / apo', percent: true },
  { code: 'contractSites', label: '成約拠点数', kind: 'auto' },
  { code: 'contractRate', label: '成約率(実施)', kind: 'computed', formula: 'contractSites / meetingDone', percent: true },
  { code: 'etCount', label: 'ET数', kind: 'auto' },
  { code: 'reschedule', label: 'リスケ', kind: 'auto' },
  { code: 'rescheduleRate', label: 'リスケ率', kind: 'computed', formula: 'reschedule / apo', percent: true },
  { code: 'preContactLost', label: '前連失注', kind: 'manual' },
  { code: 'preContactLostRate', label: '前連失注率', kind: 'computed', formula: 'preContactLost / apo', percent: true },
  { code: 'remainingVisit', label: '残訪問', kind: 'computed', formula: 'max(apo - meetingDone - preContactLost, 0)' },
];

/** 自動集計する列コード(aggregation.service が返すキー) */
export const AUTO_COLUMN_CODES = ['tossUp', 'apo', 'meetingDone', 'contractSites', 'etCount', 'reschedule'] as const;
export type AutoColumnCode = (typeof AUTO_COLUMN_CODES)[number];
export type AutoMetrics = Record<AutoColumnCode, number>;

/** 商談「実施」とみなす実施報告チェックポイント */
export const MEETING_DONE_CHECKPOINTS = ['VISIT_RESULT', 'ONLINE_RESULT'] as const;
export const RESCHEDULE_CHECKPOINT = 'RESCHEDULE';
