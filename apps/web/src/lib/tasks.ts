import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface TaskItem {
  id: string;
  title: string;
  detail: string | null;
  targetAll: boolean;
  targetDepartmentIds: string[];
  targetUserIds: string[];
  categories: { kind: 'ALL' | 'DEPARTMENT' | 'PERSONAL'; label: string }[];
  dueAt: string | null;
  currentDueAt: string | null;
  importance: number;
  remindMinutes: number | null;
  repeatType: RepeatType;
  repeatInterval: number;
  repeatWeekdays: number[];
  repeatUntil: string | null;
  createdBy: string;
  createdByName: string;
  isMine: boolean;
  doneByMe: boolean;
  /** 見ている本人が担当者として完了操作できるか(どの表示でも自分の分は可) */
  canComplete: boolean;
  /** 見ている本人の分が完了済みか */
  doneByViewer: boolean;
  /** 部署・全員表示のとき: 表示中の人のうち担当者と完了状況 */
  assignees: { id: string; name: string; done: boolean }[] | null;
  doneCount: number;
  targetCount: number;
  canEdit: boolean;
  overdue: boolean;
}

export interface TaskAlert {
  id: string;
  title: string;
  detail: string | null;
  importance: number;
  occurrence: string;
}

export type RepeatType = 'NONE' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'WEEKDAYS' | 'HOURLY';

/** 重要度(要望: 5段階で色分け) */
export const IMPORTANCE: Record<number, { label: string; color: string; text: string }> = {
  5: { label: '最重要', color: '#dc2626', text: '#fff' },
  4: { label: '高', color: '#ea580c', text: '#fff' },
  3: { label: '中', color: '#ca8a04', text: '#fff' },
  2: { label: '低', color: '#2563eb', text: '#fff' },
  1: { label: '最低', color: '#6b7280', text: '#fff' },
};

/** リマインド(要望: 1日前〜5分前)。null = 期日ちょうど */
export const REMIND_OPTIONS: { value: number | null; label: string }[] = [
  { value: 1440, label: '1日前' },
  { value: 720, label: '12時間前' },
  { value: 360, label: '6時間前' },
  { value: 180, label: '3時間前' },
  { value: 120, label: '2時間前' },
  { value: 60, label: '1時間前' },
  { value: 30, label: '30分前' },
  { value: 15, label: '15分前' },
  { value: 10, label: '10分前' },
  { value: 5, label: '5分前' },
  { value: null, label: '期日ちょうど' },
  { value: -1, label: 'なし' },
];

export const REPEAT_OPTIONS: { value: RepeatType; label: string; unit?: string }[] = [
  { value: 'NONE', label: '繰り返さない' },
  { value: 'MONTHLY', label: '月毎', unit: 'ヶ月ごと' },
  { value: 'WEEKLY', label: '週毎', unit: '週ごと' },
  { value: 'DAILY', label: '日毎', unit: '日ごと' },
  { value: 'WEEKDAYS', label: '曜日毎' },
  { value: 'HOURLY', label: '時間毎', unit: '時間ごと' },
];

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function repeatLabel(t: Pick<TaskItem, 'repeatType' | 'repeatInterval' | 'repeatWeekdays'>): string {
  const opt = REPEAT_OPTIONS.find((o) => o.value === t.repeatType);
  if (!opt || t.repeatType === 'NONE') return '';
  if (t.repeatType === 'WEEKDAYS') return `毎週 ${t.repeatWeekdays.map((d) => WEEKDAYS[d]).join('・')}`;
  return t.repeatInterval > 1 ? `${t.repeatInterval}${opt.unit}` : `毎${opt.unit?.replace('ごと', '').replace('ヶ月', '月')}`;
}

export const fmtDue = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '期日なし';

/** view: 'me'(自分) / 'user:<id>' / 'dept:<id>' / 'all' */
export function useTasks(includeDone: boolean, view = 'me') {
  return useQuery({
    queryKey: ['tasks', 'list', includeDone, view],
    queryFn: () => api.get<TaskItem[]>(`/tasks?${new URLSearchParams({ ...(includeDone ? { includeDone: '1' } : {}), ...(view !== 'me' ? { view } : {}) })}`),
  });
}

export interface TaskViewable {
  users: { id: string; name: string; departmentId: string | null }[];
  departments: { id: string; name: string }[];
  canViewOthers: boolean;
}

export function useTaskViewable() {
  return useQuery({ queryKey: ['tasks', 'viewable'], queryFn: () => api.get<TaskViewable>('/tasks/viewable'), staleTime: 60_000 });
}

export function useTaskAlerts() {
  return useQuery({ queryKey: ['tasks', 'alerts'], queryFn: () => api.get<TaskAlert[]>('/tasks/alerts'), refetchInterval: 30_000 });
}
