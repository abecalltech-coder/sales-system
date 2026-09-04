import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/AppLayout';
import { useAppointments, useStatuses, useDepartments, useUsers, AppointmentListItem, REPORT_CHECKPOINTS } from '../hooks/useApi';
import { api, ApiError } from '../lib/api';
import { parseDateText, parseTimeText, isoToDateInput, isoToTimeInput } from '../lib/dateInput';
import { monthGridDays, weekGridDays, visibleRange, isToday, snapTo15, addDays, addMonths, startOfDay } from '../lib/calendarGrid';
import { buildCalendarTitle, buildPreContactTitle, closerSurname } from '../lib/calendarTitle';

const COLOR_PALETTE = [
  '#ff887c', '#ef4444', '#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6',
  '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981',
  '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#78716c',
  '#6b7280', '#1f2937',
];
const DEFAULT_COLOR = '#3b82f6';
// 前連(30分ブロック)の予定は常にフラミンゴ色(Googleカレンダーのフラミンゴ)にする(要望)
const PRECONTACT_COLOR = '#ff887c';
const HOUR_HEIGHT = 48; // 週/日表示: 1時間あたりの高さ(px)
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 24;

const MEETING_TYPE_OPTIONS = [
  { id: 'VISIT', label: '訪問' },
  { id: 'GOOGLE_MEET', label: 'オンライン(Google Meet)' },
  { id: 'PHONE', label: '電話' },
  { id: 'OTHER', label: 'その他' },
];

const REMINDER_MINUTES_OPTIONS = [
  { minutes: 5, label: '5分前' },
  { minutes: 10, label: '10分前' },
  { minutes: 15, label: '15分前' },
  { minutes: 30, label: '30分前' },
  { minutes: 60, label: '1時間前' },
  { minutes: 120, label: '2時間前' },
  { minutes: 1440, label: '前日' },
];

type ViewMode = 'month' | 'week' | 'day';

interface DraftEvent {
  id?: string;
  version?: number;
  corporateName: string;
  dateText: string;
  startTimeText: string;
  endTimeText: string;
  meetingType: string;
  closerStatusId: string;
  snapshotDepartmentId: string;
  meetingUserId: string;
  calendarColor: string;
  memo: string;
  reminderEnabled: boolean;
  reminderMinutesBefore: number;
  // 既存アポを開いたときに表示する自動組み立て済みの題名(読み取り専用)
  titlePreview: string;
  meetingUrl: string;
}

function eventToDraft(ev: AppointmentListItem, titlePreview: string): DraftEvent {
  return {
    id: ev.id,
    version: ev.version,
    corporateName: ev.storeName ?? '',
    dateText: isoToDateInput(ev.meetingStartAt),
    startTimeText: isoToTimeInput(ev.meetingStartAt),
    endTimeText: isoToTimeInput(ev.meetingEndAt),
    meetingType: ev.meetingType,
    closerStatusId: ev.closerStatusId ?? '',
    snapshotDepartmentId: '',
    meetingUserId: '',
    // 空文字 = 未設定(部署色を使う)。案件ごとに色を持てる。
    calendarColor: ev.calendarColor ?? '',
    memo: ev.memo ?? '',
    reminderEnabled: ev.reminderEnabled,
    reminderMinutesBefore: ev.reminderMinutesBefore ?? 30,
    titlePreview,
    meetingUrl: ev.meetingUrl ?? '',
  };
}

function slotToDraft(slot: Date): DraftEvent {
  const pad = (n: number) => String(n).padStart(2, '0');
  const startMin = snapTo15(slot.getHours() * 60 + slot.getMinutes());
  const endMin = startMin + 60;
  const toHm = (totalMin: number) => `${pad(Math.floor(totalMin / 60) % 24)}:${pad(totalMin % 60)}`;
  return {
    corporateName: '',
    dateText: `${slot.getMonth() + 1}/${slot.getDate()}`,
    startTimeText: toHm(startMin),
    endTimeText: toHm(endMin),
    meetingType: 'VISIT',
    closerStatusId: '',
    snapshotDepartmentId: '',
    meetingUserId: '',
    calendarColor: DEFAULT_COLOR,
    memo: '',
    reminderEnabled: false,
    reminderMinutesBefore: 30,
    titlePreview: '',
    meetingUrl: '',
  };
}

export function CLCalendarPage() {
  // ベース表示は「日」(要望)
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [anchor, setAnchor] = useState(() => new Date());
  const [departmentId, setDepartmentId] = useState('');
  const [closerStatusId, setCloserStatusId] = useState('');
  const [accountUserId, setAccountUserId] = useState('');
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: departments } = useDepartments();
  const { data: closerOptions } = useStatuses('APPOINTMENT_CLOSER');
  const { data: usersData } = useUsers({ page: 1, pageSize: 100 });
  const { data: departmentBranchOptions } = useStatuses('DEPARTMENT_BRANCH');

  const range = useMemo(() => visibleRange(viewMode, anchor), [viewMode, anchor]);
  const { data, isLoading } = useAppointments({
    page: 1,
    pageSize: 100,
    dateFrom: range.from.toISOString(),
    dateTo: range.to.toISOString(),
    departmentId: departmentId || undefined,
    closerStatusId: closerStatusId || undefined,
    userId: accountUserId || undefined,
  });
  const events = useMemo(() => (data?.items ?? []).filter((e) => e.meetingStartAt || e.preContactAt), [data]);
  const displayEvents = useMemo(
    () => buildDisplayEvents(events, departmentBranchOptions, closerOptions),
    [events, departmentBranchOptions, closerOptions],
  );

  const closerLabel = (id: string | null) => closerOptions?.find((s) => s.id === id)?.displayName ?? '';

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/appointments', body),
    onSuccess: () => {
      setDraft(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '作成に失敗しました'),
  });
  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; version: number; patch: Record<string, unknown> }) =>
      api.patch(`/appointments/${vars.id}`, { version: vars.version, ...vars.patch }),
    onSuccess: () => {
      setDraft(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  const saveDraft = (d: DraftEvent) => {
    const parsedDate = parseDateText(d.dateText);
    if (!parsedDate) {
      setError('日付は 8/10・8-10・0810 のような形式で入力してください');
      return;
    }
    const parsedStart = parseTimeText(d.startTimeText);
    if (!parsedStart) {
      setError('開始時間は 9:00・9：00・0900 のような形式で入力してください');
      return;
    }
    const meetingStartAt = new Date(`${parsedDate}T${parsedStart}`).toISOString();
    let meetingEndAt: string | undefined;
    if (d.endTimeText.trim()) {
      const parsedEnd = parseTimeText(d.endTimeText);
      if (!parsedEnd) {
        setError('終了時間は 10:00・10：00・1000 のような形式で入力してください');
        return;
      }
      meetingEndAt = new Date(`${parsedDate}T${parsedEnd}`).toISOString();
    }

    if (d.id && d.version != null) {
      // 既存アポの予定モーダルで編集できるのは日時・色・リマインド・備考のみ。
      // 店舗名/形式/CL/部署/フック等はアポ実績で編集する(要望)。
      updateMutation.mutate({
        id: d.id,
        version: d.version,
        patch: {
          meetingStartAt,
          meetingEndAt,
          calendarColor: d.calendarColor,
          memo: d.memo || undefined,
          reminderEnabled: d.reminderEnabled,
          reminderMinutesBefore: d.reminderEnabled ? d.reminderMinutesBefore : undefined,
        },
      });
    } else {
      createMutation.mutate({
        corporateName: d.corporateName || undefined,
        meetingStartAt,
        meetingEndAt,
        meetingType: d.meetingType,
        closerStatusId: d.closerStatusId || undefined,
        snapshotDepartmentId: d.snapshotDepartmentId || undefined,
        meetingUserId: d.meetingUserId || undefined,
        calendarColor: d.calendarColor,
        memo: d.memo || undefined,
        reminderEnabled: d.reminderEnabled,
        reminderMinutesBefore: d.reminderEnabled ? d.reminderMinutesBefore : undefined,
      });
    }
  };

  const navigate = (dir: -1 | 1) => {
    setAnchor((a) => (viewMode === 'month' ? addMonths(a, dir) : viewMode === 'week' ? addDays(a, dir * 7) : addDays(a, dir)));
  };

  const title =
    viewMode === 'month'
      ? `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`
      : viewMode === 'week'
        ? (() => {
            const days = weekGridDays(anchor);
            return `${days[0].getFullYear()}年${days[0].getMonth() + 1}月${days[0].getDate()}日 〜 ${days[6].getMonth() + 1}月${days[6].getDate()}日`;
          })()
        : `${anchor.getFullYear()}年${anchor.getMonth() + 1}月${anchor.getDate()}日`;

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">CLカレンダー</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['month', 'week', 'day'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  background: viewMode === v ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: viewMode === v ? '#fff' : 'inherit',
                }}
              >
                {v === 'month' ? '月' : v === 'week' ? '週' : '日'}
              </button>
            ))}
          </div>
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => navigate(-1)}>← 前へ</button>
            <button onClick={() => setAnchor(new Date())}>今日</button>
            <button onClick={() => navigate(1)}>次へ →</button>
            <span style={{ fontWeight: 700, fontSize: 15, marginLeft: 8 }}>{title}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ fontSize: 12, padding: 4 }}>
              <option value="">全部署</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select value={closerStatusId} onChange={(e) => setCloserStatusId(e.target.value)} style={{ fontSize: 12, padding: 4 }}>
              <option value="">全CL</option>
              {closerOptions?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
            <select value={accountUserId} onChange={(e) => setAccountUserId(e.target.value)} style={{ fontSize: 12, padding: 4 }}>
              <option value="">全アカウント</option>
              {usersData?.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading && <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>}

        {viewMode === 'month' && (
          <MonthGrid
            anchor={anchor}
            events={displayEvents}
            closerLabel={closerLabel}
            onSlotClick={(day) => setDraft(slotToDraft(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0)))}
            onEventClick={(ev, title) => setDraft(eventToDraft(ev, title))}
          />
        )}
        {viewMode !== 'month' && (
          <TimeGrid
            days={viewMode === 'week' ? weekGridDays(anchor) : [startOfDay(anchor)]}
            events={displayEvents}
            closerLabel={closerLabel}
            onSlotClick={(slot) => setDraft(slotToDraft(slot))}
            onEventClick={(ev, title) => setDraft(eventToDraft(ev, title))}
          />
        )}
      </div>

      {draft && (
        <EventFormModal
          draft={draft}
          departments={departments}
          closerOptions={closerOptions}
          users={usersData?.items}
          saving={createMutation.isPending || updateMutation.isPending}
          onChange={setDraft}
          onSave={() => saveDraft(draft)}
          onClose={() => {
            setDraft(null);
            setError(null);
          }}
        />
      )}
    </AppLayout>
  );
}

/**
 * 商談予定のタイトルは「部署 CL名字 都道府県頭文字 【フック】店舗名」で都度組み立てる(要望)。
 * 部署(DEPARTMENT_BRANCH)・CL・フック・店舗名を変えると即座に題名へ反映される。時刻は入れない。
 */
function eventLabel(ev: AppointmentListItem, branchLabel: string, closerName: string): string {
  const composed = buildCalendarTitle({
    departmentLabel: branchLabel,
    closerSurname: closerSurname(closerName),
    prefecture: ev.prefecture,
    hook: ev.hook ?? '',
    storeName: ev.storeName ?? '(店舗名未設定)',
  });
  return composed || ev.storeName || '(店舗名未設定)';
}

interface CalendarEvent {
  key: string;
  start: Date;
  end: Date | null;
  title: string;
  color: string;
  appointment: AppointmentListItem;
}

/**
 * Appointmentごとに、商談予定(メイン)に加えて前連日時が入力されている場合は
 * 30分の前連予定を表示用に合成する(DBには保存しない派生イベント)。
 */
function buildDisplayEvents(
  events: AppointmentListItem[],
  departmentBranchOptions: { id: string; displayName: string; color: string | null }[] | undefined,
  closerOptions: { id: string; displayName: string }[] | undefined,
): CalendarEvent[] {
  const result: CalendarEvent[] = [];
  for (const ev of events) {
    const departmentStatus = departmentBranchOptions?.find((s) => s.id === ev.department);
    const branchLabel = departmentStatus?.displayName ?? '';
    const closerName = closerOptions?.find((s) => s.id === ev.closerStatusId)?.displayName ?? '';
    if (ev.meetingStartAt) {
      result.push({
        key: ev.id,
        start: new Date(ev.meetingStartAt),
        end: ev.meetingEndAt ? new Date(ev.meetingEndAt) : null,
        title: eventLabel(ev, branchLabel, closerName),
        // 商談予定の色は案件ごとに設定した calendarColor を優先(未設定時のみ部署色)
        color: ev.calendarColor || departmentStatus?.color || DEFAULT_COLOR,
        appointment: ev,
      });
    }
    if (ev.preContactAt) {
      const start = new Date(ev.preContactAt);
      result.push({
        key: `${ev.id}-precontact`,
        start,
        end: new Date(start.getTime() + 30 * 60000),
        title: buildPreContactTitle({
          departmentLabel: branchLabel,
          closerSurname: closerSurname(closerName),
          prefecture: ev.prefecture,
          storeName: ev.storeName ?? '',
        }),
        // 前連は常にフラミンゴ色(要望)
        color: PRECONTACT_COLOR,
        appointment: ev,
      });
    }
  }
  return result;
}

function MonthGrid({
  anchor,
  events,
  closerLabel,
  onSlotClick,
  onEventClick,
}: {
  anchor: Date;
  events: CalendarEvent[];
  closerLabel: (id: string | null) => string;
  onSlotClick: (day: Date) => void;
  onEventClick: (ev: AppointmentListItem, title: string) => void;
}) {
  const days = monthGridDays(anchor);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = `${ev.start.getFullYear()}-${ev.start.getMonth()}-${ev.start.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime());
    return map;
  }, [events]);

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#fafafa', borderBottom: '1px solid var(--color-border)' }}>
        {['日', '月', '火', '水', '木', '金', '土'].map((w) => (
          <div key={w} style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textAlign: 'center' }}>
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '110px' }}>
        {days.map((day, i) => {
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const dayEvents = eventsByDay.get(key) ?? [];
          const inMonth = day.getMonth() === anchor.getMonth();
          return (
            <div
              key={i}
              onClick={() => onSlotClick(day)}
              style={{
                borderRight: (i + 1) % 7 === 0 ? 'none' : '1px solid var(--color-border)',
                borderBottom: '1px solid var(--color-border)',
                padding: 4,
                cursor: 'pointer',
                background: inMonth ? 'var(--color-surface)' : '#fafafa',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: isToday(day) ? 800 : 500,
                  color: isToday(day) ? 'var(--color-primary)' : inMonth ? 'inherit' : 'var(--color-text-faint)',
                  marginBottom: 3,
                }}
              >
                {day.getDate()}
              </div>
              {dayEvents.slice(0, 3).map((ev) => (
                <div
                  key={ev.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick(ev.appointment, ev.title);
                  }}
                  title={`${closerLabel(ev.appointment.closerStatusId)} ${ev.title}`}
                  style={{
                    fontSize: 10,
                    padding: '1px 4px',
                    marginBottom: 2,
                    borderRadius: 3,
                    background: ev.color,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {ev.title}
                </div>
              ))}
              {dayEvents.length > 3 && <div style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>+{dayEvents.length - 3}件</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({
  days,
  events,
  closerLabel,
  onSlotClick,
  onEventClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  closerLabel: (id: string | null) => string;
  onSlotClick: (slot: Date) => void;
  onEventClick: (ev: AppointmentListItem, title: string) => void;
}) {
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);
  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = `${ev.start.getFullYear()}-${ev.start.getMonth()}-${ev.start.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', display: 'flex' }}>
      <div style={{ width: 48, flexShrink: 0, borderRight: '1px solid var(--color-border)' }}>
        <div style={{ height: 28, borderBottom: '1px solid var(--color-border)' }} />
        <div style={{ position: 'relative', height: gridHeight }}>
          {hours.map((h, hi) => (
            <span
              key={h}
              style={{ position: 'absolute', top: hi * HOUR_HEIGHT - 6, right: 4, fontSize: 10, color: 'var(--color-text-faint)' }}
            >
              {h % 24}:00
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
        {days.map((day, i) => {
          const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <div key={i} style={{ flex: 1, minWidth: 90, borderRight: i === days.length - 1 ? 'none' : '1px solid var(--color-border)' }}>
              <div
                style={{
                  height: 28,
                  borderBottom: '1px solid var(--color-border)',
                  fontSize: 11,
                  fontWeight: isToday(day) ? 800 : 600,
                  color: isToday(day) ? 'var(--color-primary)' : 'inherit',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                {'日月火水木金土'[day.getDay()]} {day.getDate()}
              </div>
              <div
                style={{ position: 'relative', height: gridHeight }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const offsetY = e.clientY - rect.top;
                  const minutesFromStart = (offsetY / HOUR_HEIGHT) * 60;
                  const totalMinutes = snapTo15(DAY_START_HOUR * 60 + minutesFromStart);
                  const slot = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(totalMinutes / 60), totalMinutes % 60);
                  onSlotClick(slot);
                }}
              >
                {hours.map((h, hi) => (
                  <div key={h} style={{ position: 'absolute', top: hi * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT, borderBottom: '1px solid #f1f1f1' }} />
                ))}
                {dayEvents.map((ev) => {
                  const start = ev.start;
                  const startMin = start.getHours() * 60 + start.getMinutes() - DAY_START_HOUR * 60;
                  const durationMin = ev.end ? (ev.end.getTime() - start.getTime()) / 60000 : 60;
                  const top = (Math.max(startMin, 0) / 60) * HOUR_HEIGHT;
                  const height = Math.max((durationMin / 60) * HOUR_HEIGHT, 16);
                  return (
                    <div
                      key={ev.key}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev.appointment, ev.title);
                      }}
                      title={`${closerLabel(ev.appointment.closerStatusId)} ${ev.title}`}
                      style={{
                        position: 'absolute',
                        top,
                        left: 2,
                        right: 2,
                        height,
                        background: ev.color,
                        color: '#fff',
                        borderRadius: 4,
                        padding: '2px 4px',
                        fontSize: 10,
                        overflow: 'hidden',
                        cursor: 'pointer',
                      }}
                    >
                      {ev.title}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventFormModal({
  draft,
  departments,
  closerOptions,
  users,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  draft: DraftEvent;
  departments: { id: string; name: string }[] | undefined;
  closerOptions: { id: string; displayName: string }[] | undefined;
  users: { id: string; name: string }[] | undefined;
  saving: boolean;
  onChange: (d: DraftEvent) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<DraftEvent>) => onChange({ ...draft, ...patch });
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: 460, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', background: 'var(--color-surface)', padding: 20, borderRadius: 10 }}
      >
        <h2 style={{ fontSize: 16, marginBottom: 14 }}>{draft.id ? '予定を編集' : '予定を追加'}</h2>

        {draft.id ? (
          <div
            style={{
              marginBottom: 12,
              padding: '8px 10px',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--color-text-faint)', marginBottom: 4 }}>
              カレンダー題名(自動 / 部署・CL・フックはアポ実績で編集)
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, wordBreak: 'break-word' }}>{draft.titlePreview || '(未設定)'}</div>
          </div>
        ) : (
          <>
            <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 3 }}>店舗名</label>
            <input value={draft.corporateName} onChange={(e) => set({ corporateName: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 3 }}>日付</label>
            <input value={draft.dateText} onChange={(e) => set({ dateText: e.target.value })} placeholder="8/10" style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 3 }}>開始</label>
            <input value={draft.startTimeText} onChange={(e) => set({ startTimeText: e.target.value })} placeholder="9:00" style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 3 }}>終了</label>
            <input value={draft.endTimeText} onChange={(e) => set({ endTimeText: e.target.value })} placeholder="10:00" style={{ width: '100%' }} />
          </div>
        </div>

        {!draft.id && (
          <>
            <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 3 }}>形式</label>
            <select value={draft.meetingType} onChange={(e) => set({ meetingType: e.target.value })} style={{ width: '100%', marginBottom: 10 }}>
              {MEETING_TYPE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>

            <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 3 }}>CL</label>
            <select value={draft.closerStatusId} onChange={(e) => set({ closerStatusId: e.target.value })} style={{ width: '100%', marginBottom: 10 }}>
              <option value="">未選択</option>
              {closerOptions?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>

            <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 3 }}>所属部署(組織)</label>
            <select value={draft.snapshotDepartmentId} onChange={(e) => set({ snapshotDepartmentId: e.target.value })} style={{ width: '100%', marginBottom: 10 }}>
              <option value="">未選択</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 3 }}>担当アカウント</label>
            <select value={draft.meetingUserId} onChange={(e) => set({ meetingUserId: e.target.value })} style={{ width: '100%', marginBottom: 10 }}>
              <option value="">未選択</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </>
        )}

        <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 3 }}>備考(アポ詳細・全文)</label>
        <textarea
          value={draft.memo}
          onChange={(e) => set({ memo: e.target.value })}
          style={{ width: '100%', minHeight: 320, marginBottom: 10, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontSize: 13 }}
        />

        <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>
          この予定の色（案件ごとに設定できます）
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              title={c === '#ff887c' ? 'フラミンゴ' : undefined}
              onClick={() => set({ calendarColor: c })}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: c,
                border: draft.calendarColor === c ? '2px solid var(--color-text)' : '2px solid transparent',
                boxShadow: draft.calendarColor === c ? '0 0 0 2px var(--color-surface) inset' : 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => set({ calendarColor: '' })}
            style={{ fontSize: 11, padding: '2px 8px', marginLeft: 4 }}
          >
            部署色に戻す
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-faint)', margin: '0 0 16px' }}>
          ※ 前連（30分）の予定は常にフラミンゴ色で表示されます。
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: draft.reminderEnabled ? 8 : 16 }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.reminderEnabled} onChange={(e) => set({ reminderEnabled: e.target.checked })} />
            リマインド
          </label>
        </div>
        {draft.reminderEnabled && (
          <select
            value={draft.reminderMinutesBefore}
            onChange={(e) => set({ reminderMinutesBefore: Number(e.target.value) })}
            style={{ width: '100%', marginBottom: 16 }}
          >
            {REMINDER_MINUTES_OPTIONS.map((o) => (
              <option key={o.minutes} value={o.minutes}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        {draft.id && <MeetSection appointmentId={draft.id} meetingUrl={draft.meetingUrl} defaultTitle={draft.titlePreview} />}

        {draft.id && <ReportSection appointmentId={draft.id} />}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}>キャンセル</button>
          <button className="btn-primary" onClick={onSave} disabled={saving}>
            {draft.id ? '更新する' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Google Meet セクション(要望: Meetの題名は都度作成、アポ詳細のmeetingUrlへ自動追記)。
 * Googleカレンダー未連携の場合はエラーメッセージが返る(連携設定から接続)。
 */
function MeetSection({ appointmentId, meetingUrl, defaultTitle }: { appointmentId: string; meetingUrl: string; defaultTitle: string }) {
  const [title, setTitle] = useState(defaultTitle);
  const [url, setUrl] = useState(meetingUrl);
  const [err, setErr] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => api.post<{ meetUrl: string }>(`/integrations/google-calendar/appointments/${appointmentId}/create-meet`, { title }),
    onSuccess: (res) => {
      setUrl(res.meetUrl);
      setErr(null);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Meetの作成に失敗しました'),
  });

  return (
    <div style={{ marginBottom: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
      <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 6 }}>Google Meet</label>
      {url && (
        <div style={{ fontSize: 12, marginBottom: 6, wordBreak: 'break-all' }}>
          <a href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
        </div>
      )}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Meetの題名"
        style={{ width: '100%', marginBottom: 6 }}
      />
      {err && <p style={{ fontSize: 11, color: 'var(--color-danger)', marginBottom: 6 }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {url ? 'Meetを作り直す' : 'Meetを作成'}
        </button>
      </div>
    </div>
  );
}

/**
 * 実施報告フォーム(要望: 定型文ボタンではなく、種別を選んで内容を入力する形式)。
 * 提出内容はアポの備考へ自動追記され、部署責任者(MANAGER)へ確認通知として届く。
 */
function ReportSection({ appointmentId }: { appointmentId: string }) {
  const [checkpoint, setCheckpoint] = useState<string>(REPORT_CHECKPOINTS[0].id);
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const queryClient = useQueryClient();

  const reportMutation = useMutation({
    mutationFn: (body: { appointmentId: string; checkpoint: string; reportText: string }) => api.post('/appointment-reports', body),
    onSuccess: () => {
      setDone(true);
      setText('');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment-reports'] });
    },
  });

  return (
    <div style={{ marginBottom: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
      <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 6 }}>実施報告</label>
      <select
        value={checkpoint}
        onChange={(e) => {
          setCheckpoint(e.target.value);
          setDone(false);
        }}
        style={{ width: '100%', marginBottom: 6 }}
      >
        {REPORT_CHECKPOINTS.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDone(false);
        }}
        placeholder={checkpoint === 'RESCHEDULE' ? '再訪日または次回商談日を含めて記載してください' : '報告内容を入力'}
        style={{ width: '100%', minHeight: 60, marginBottom: 6 }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
        {done && <span style={{ fontSize: 11, color: 'var(--color-success)' }}>✓ 報告しました</span>}
        <button
          className="btn-primary"
          disabled={!text.trim() || reportMutation.isPending}
          onClick={() => reportMutation.mutate({ appointmentId, checkpoint, reportText: text.trim() })}
        >
          報告する
        </button>
      </div>
    </div>
  );
}
