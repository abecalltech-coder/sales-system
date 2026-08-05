import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { useAppointments, useStatuses, AppointmentListItem } from '../../hooks/useApi';

const MEETING_TYPE_LABEL: Record<string, string> = {
  VISIT: '訪問',
  GOOGLE_MEET: 'Google Meet',
  PHONE: '電話',
  OTHER: 'その他',
};

const SYNC_STATUS_LABEL: Record<string, string> = {
  NOT_SYNCED: '未連携',
  SYNCING: '連携中',
  SYNCED: '連携済み',
  ERROR: 'エラー',
};

export function AppointmentsListPage() {
  const [page, setPage] = useState(1);
  const [statusId, setStatusId] = useState('');
  const pageSize = 20;
  const navigate = useNavigate();

  const { data, isLoading } = useAppointments({ page, pageSize, statusId: statusId || undefined });
  const { data: statuses } = useStatuses('APPOINTMENT');

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;
  const statusColor = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#9ca3af';

  const columns: Column<AppointmentListItem>[] = [
    { key: 'caseNumber', label: '案件番号', render: (r) => r.caseNumber, width: 160 },
    {
      key: 'meetingStartAt',
      label: '商談開始予定',
      render: (r) => (r.meetingStartAt ? new Date(r.meetingStartAt).toLocaleString('ja-JP') : '未確定'),
      width: 160,
    },
    { key: 'meetingType', label: '商談形式', render: (r) => MEETING_TYPE_LABEL[r.meetingType] ?? r.meetingType, width: 100 },
    { key: 'visitAddress', label: '訪問先住所', render: (r) => r.visitAddress ?? '-' },
    {
      key: 'calendarSyncStatus',
      label: 'カレンダー連携',
      render: (r) => SYNC_STATUS_LABEL[r.calendarSyncStatus] ?? r.calendarSyncStatus,
      width: 110,
    },
    {
      key: 'status',
      label: '商談ステータス',
      render: (r) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 12,
            color: '#fff',
            background: statusColor(r.meetingStatusId),
          }}
        >
          {statusLabel(r.meetingStatusId)}
        </span>
      ),
      width: 120,
    },
  ];

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 20 }}>アポ実績管理</h1>
          <a href="/api/appointments/export" style={{ fontSize: 13 }}>
            CSV出力
          </a>
        </div>

        <div style={{ marginBottom: 16 }}>
          <select
            value={statusId}
            onChange={(e) => {
              setStatusId(e.target.value);
              setPage(1);
            }}
            style={{ padding: 6, fontSize: 13 }}
          >
            <option value="">すべてのステータス</option>
            {statuses?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          loading={isLoading}
          onPageChange={setPage}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/appointments/${r.id}`)}
        />
      </div>
    </AppLayout>
  );
}
