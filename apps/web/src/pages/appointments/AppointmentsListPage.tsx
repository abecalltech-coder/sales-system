import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { ColumnFilterHeader } from '../../components/ColumnFilterHeader';
import { InlineText, InlineSelect, InlineFlexDate, InlineFlexTime } from '../../components/InlineEdit';
import { CommentsPanel } from '../../components/CommentsPanel';
import { PresenceBar } from '../../components/PresenceBar';
import { useAppointments, useStatuses, useMe, StatusMasterItem, AppointmentListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { formatDate, isoToDateInput } from '../../lib/dateInput';
import { usePresence } from '../../lib/usePresence';

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const inlineInputStyle = { border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', width: '100%', padding: 0 } as const;

function toOptions(list: StatusMasterItem[] | undefined) {
  return list?.map((s) => ({ id: s.id, label: s.displayName })) ?? [];
}

type FilterValueFn = (r: AppointmentListItem) => string;

export function AppointmentsListPage() {
  const [page, setPage] = useState(1);
  const [statusId, setStatusId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 列フィルター(Googleスプレッドシート風、トスと同仕様)。自分の画面だけのローカルstateで他ユーザーには共有しない。
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({});
  const pageSize = 100;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useAppointments({ page, pageSize, statusId: statusId || undefined });
  const { data: me } = useMe();
  const presence = usePresence('APPOINTMENT', me?.id);
  const { data: statuses } = useStatuses('APPOINTMENT');
  const { data: preConfirmOptions } = useStatuses('TOSS_PRE_CONFIRM');
  const { data: preContactOptions } = useStatuses('APPOINTMENT_PRE_CONTACT');
  const { data: closerOptions } = useStatuses('APPOINTMENT_CLOSER');
  const { data: departmentOptions } = useStatuses('DEPARTMENT_BRANCH');
  const { data: hpProgressOptions } = useStatuses('APPOINTMENT_HP_PROGRESS');
  const { data: typeOptions } = useStatuses('APPOINTMENT_TYPE');
  const { data: progressOptions } = useStatuses('APPOINTMENT_PROGRESS');
  const { data: acquisitionMethodOptions } = useStatuses('APPOINTMENT_ACQUISITION_METHOD');
  const { data: anshinBizStatusOptions } = useStatuses('APPOINTMENT_ANSHIN_BIZ_STATUS');
  const { data: anshinBizLostReasonOptions } = useStatuses('APPOINTMENT_ANSHIN_BIZ_LOST_REASON');
  const { data: mobileStatusOptions } = useStatuses('APPOINTMENT_MOBILE_STATUS');
  const { data: mobileLostReasonOptions } = useStatuses('APPOINTMENT_MOBILE_LOST_REASON');
  const { data: funfoStatusOptions } = useStatuses('APPOINTMENT_FUNFO_STATUS');
  const { data: funfoLostReasonOptions } = useStatuses('APPOINTMENT_FUNFO_LOST_REASON');
  const { data: consentFormTypeOptions } = useStatuses('APPOINTMENT_CONSENT_FORM_TYPE');
  const { data: deliveryMethodOptions } = useStatuses('APPOINTMENT_DELIVERY_METHOD');
  const { data: deliveryStatusOptions } = useStatuses('APPOINTMENT_DELIVERY_STATUS');

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;
  const statusColor = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#9ca3af';
  // 進捗の並び順(ET→成約→保留→失注→リスケ→新規訪問等)はStatusMaster.orderで表現している
  const progressGroupOrder = (id: string | null) => (id ? progressOptions?.find((s) => s.id === id)?.order ?? 999 : 999);
  const progressBg = (id: string | null) => (id ? progressOptions?.find((s) => s.id === id)?.color ?? '#ffffff' : '#ffffff');

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; version: number; patch: Record<string, unknown> }) =>
      api.patch(`/appointments/${vars.id}`, { version: vars.version, ...vars.patch }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });
  const save = (row: AppointmentListItem, patch: Record<string, unknown>) =>
    updateMutation.mutate({ id: row.id, version: row.version, patch });

  const retryCalendarMutation = useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/retry-calendar`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  // 列ごとの絞り込み用の値抽出関数。各列ヘルパーが自身の列を作る際に登録する。
  const filterValueFns: Record<string, FilterValueFn> = {};
  const rawRows = useMemo(() => data?.items ?? [], [data]);
  const optionsFor = (key: string) => {
    const fn = filterValueFns[key];
    if (!fn) return [];
    const set = new Set<string>();
    for (const r of rawRows) set.add(fn(r));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  };
  const filterHeader = (key: string, label: string) => () => (
    <ColumnFilterHeader
      label={label}
      options={optionsFor(key)}
      selected={filters[key] ?? null}
      onChange={(sel) => setFilters((f) => ({ ...f, [key]: sel }))}
    />
  );

  // 日付だけを手入力で編集する列を作る共通ヘルパー(カレンダーピッカーは使わない)
  const dateColumn = (key: keyof AppointmentListItem, label: string, width = 100): Column<AppointmentListItem> => {
    filterValueFns[key as string] = (r) => isoToDateInput(r[key] as string | null);
    return {
      key: key as string,
      label,
      width,
      renderHeader: filterHeader(key as string, label),
      render: (r) => {
        const value = r[key] as string | null;
        return <InlineFlexDate iso={value} label={label} onSave={(iso) => save(r, { [key]: iso })} onInvalid={setError} />;
      },
    };
  };

  const checkboxColumn = (key: keyof AppointmentListItem, label: string, width = 90): Column<AppointmentListItem> => {
    filterValueFns[key as string] = (r) => (r[key] ? '済' : '未');
    return {
      key: key as string,
      label,
      width,
      renderHeader: filterHeader(key as string, label),
      render: (r) => (
        <input type="checkbox" checked={Boolean(r[key])} onClick={stop} onChange={(e) => save(r, { [key]: e.target.checked })} />
      ),
    };
  };

  const selectColumn = (
    key: keyof AppointmentListItem,
    label: string,
    options: StatusMasterItem[] | undefined,
    width = 100,
  ): Column<AppointmentListItem> => {
    filterValueFns[key as string] = (r) => options?.find((s) => s.id === r[key])?.displayName ?? '';
    return {
      key: key as string,
      label,
      width,
      renderHeader: filterHeader(key as string, label),
      render: (r) => <InlineSelect value={r[key] as string | null} options={toOptions(options)} onSave={(v) => save(r, { [key]: v })} />,
    };
  };

  const textColumn = (key: keyof AppointmentListItem, label: string, width = 100): Column<AppointmentListItem> => {
    filterValueFns[key as string] = (r) => (r[key] as string | null) ?? '';
    return {
      key: key as string,
      label,
      width,
      renderHeader: filterHeader(key as string, label),
      render: (r) => <InlineText value={r[key] as string | null} onSave={(v) => save(r, { [key]: v })} />,
    };
  };

  filterValueFns.apoDate = (r) => formatDate(r.createdAt);
  filterValueFns.meetingDate = (r) => isoToDateInput(r.meetingStartAt);
  filterValueFns.meetingTime = (r) => (r.meetingStartAt ? new Date(r.meetingStartAt).toTimeString().slice(0, 5) : '');
  filterValueFns.storeName = (r) => r.storeName ?? '';
  filterValueFns.contactName = (r) => r.customer?.contactName ?? '';
  filterValueFns.phone = (r) => r.customer?.phone ?? '';
  filterValueFns.prefecture = (r) => r.prefecture ?? '';
  filterValueFns.address = (r) => r.customer?.address ?? '';
  filterValueFns.anshinBizPoints = (r) => (r.anshinBizPoints != null ? String(r.anshinBizPoints) : '');
  filterValueFns.email = (r) => r.customer?.email ?? '';
  filterValueFns.status = (r) => statusLabel(r.meetingStatusId);

  const columns: Column<AppointmentListItem>[] = [
    { key: 'apoDate', label: 'アポ日', render: (r) => formatDate(r.createdAt), width: 90, renderHeader: filterHeader('apoDate', 'アポ日') },
    {
      key: 'meetingDate',
      label: '商談日',
      width: 92,
      renderHeader: filterHeader('meetingDate', '商談日'),
      render: (r) => (
        <InlineFlexDate iso={r.meetingStartAt} label="商談日" onSave={(iso) => save(r, { meetingStartAt: iso })} onInvalid={setError} />
      ),
    },
    {
      key: 'meetingTime',
      label: '商談時間',
      width: 74,
      renderHeader: filterHeader('meetingTime', '商談時間'),
      render: (r) => (
        <InlineFlexTime iso={r.meetingStartAt} label="商談時間" onSave={(iso) => save(r, { meetingStartAt: iso })} onInvalid={setError} />
      ),
    },
    textColumn('apStaffName', 'AP', 80),
    selectColumn('preConfirmStatusId', '前確', preConfirmOptions, 90),
    selectColumn('preContactStatusId', '前連担当', preContactOptions, 100),
    selectColumn('closerStatusId', 'CL', closerOptions, 90),
    textColumn('hook', 'フック', 100),
    selectColumn('department', '部署', departmentOptions, 84),
    {
      key: 'storeName',
      label: '店舗名',
      width: 120,
      renderHeader: filterHeader('storeName', '店舗名'),
      render: (r) => <InlineText value={r.storeName} onSave={(v) => save(r, { corporateName: v })} style={{ fontWeight: 600 }} />,
    },
    textColumn('memo', '備考', 120),
    {
      key: 'status',
      label: '商談ステータス',
      renderHeader: filterHeader('status', '商談ステータス'),
      render: (r) => (
        <InlineSelect
          value={r.meetingStatusId}
          options={toOptions(statuses)}
          onSave={(v) => save(r, { meetingStatusId: v })}
          style={{
            background: statusColor(r.meetingStatusId),
            color: '#fff',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 600,
            textAlign: 'center',
          }}
        />
      ),
      width: 120,
    },
    textColumn('industry', '業種', 84),
    dateColumn('importantMattersOkAt', '重説OK日'),
    dateColumn('electronicContractAt', 'ET日'),
    dateColumn('nextActionAt', '決着予定日'),
    {
      key: 'contactName',
      label: '担当者名',
      width: 96,
      renderHeader: filterHeader('contactName', '担当者名'),
      render: (r) => <InlineText value={r.customer?.contactName ?? null} onSave={(v) => save(r, { contactName: v })} />,
    },
    {
      key: 'phone',
      label: '店舗連絡先',
      width: 108,
      renderHeader: filterHeader('phone', '店舗連絡先'),
      render: (r) => <InlineText value={r.customer?.phone ?? null} onSave={(v) => save(r, { phone: v })} />,
    },
    { key: 'prefecture', label: '地域', render: (r) => r.prefecture ?? '-', width: 72, renderHeader: filterHeader('prefecture', '地域') },
    {
      key: 'address',
      label: '住所',
      width: 160,
      renderHeader: filterHeader('address', '住所'),
      render: (r) => <InlineText value={r.customer?.address ?? null} onSave={(v) => save(r, { address: v })} />,
    },
    selectColumn('hpProgressStatusId', 'HP進捗', hpProgressOptions, 100),
    selectColumn('typeStatusId', '種別', typeOptions, 90),
    selectColumn('progressStatusId', '進捗', progressOptions, 110),
    textColumn('listName', 'リスト', 96),
    selectColumn('acquisitionMethodStatusId', '獲得方法', acquisitionMethodOptions, 100),
    textColumn('proposalLocation', '提案場所', 100),
    textColumn('existingContract', '既契約', 100),
    checkboxColumn('anshinBizProposed', 'あんしんBiz(提案)', 90),
    selectColumn('anshinBizStatusId', 'あんしんBiz', anshinBizStatusOptions, 100),
    selectColumn('anshinBizLostReasonStatusId', 'あんしんBiz失注理由', anshinBizLostReasonOptions, 130),
    {
      key: 'anshinBizPoints',
      label: 'あんしんBiz Pt',
      width: 90,
      renderHeader: filterHeader('anshinBizPoints', 'あんしんBiz Pt'),
      render: (r) => (
        <input
          type="text"
          inputMode="numeric"
          defaultValue={r.anshinBizPoints != null ? String(r.anshinBizPoints) : ''}
          onClick={stop}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const current = r.anshinBizPoints != null ? String(r.anshinBizPoints) : '';
            if (raw === current) return;
            if (raw === '') {
              save(r, { anshinBizPoints: null });
              return;
            }
            const num = Number(raw);
            if (!Number.isFinite(num)) {
              setError('あんしんBiz Ptは数値で入力してください');
              e.target.value = current;
              return;
            }
            save(r, { anshinBizPoints: num });
          }}
          style={inlineInputStyle}
        />
      ),
    },
    checkboxColumn('mobileProposed', 'モバイル（提案）', 90),
    selectColumn('mobileStatusId', 'モバイル', mobileStatusOptions, 100),
    selectColumn('mobileLostReasonStatusId', 'モバイル失注理由', mobileLostReasonOptions, 130),
    checkboxColumn('funfoProposed', 'funfo（提案）', 90),
    selectColumn('funfoStatusId', 'funfo', funfoStatusOptions, 90),
    selectColumn('funfoLostReasonStatusId', 'funfo失注理由', funfoLostReasonOptions, 120),
    textColumn('deductionNote', '※減算※', 100),
    selectColumn('consentFormTypeStatusId', '同意書種別', consentFormTypeOptions, 110),
    textColumn('acquiredCompanyName', '獲得社名', 110),
    selectColumn('deliveryMethodStatusId', '交付方法', deliveryMethodOptions, 100),
    selectColumn('deliveryStatusStatusId', '交付状況', deliveryStatusOptions, 100),
    dateColumn('deliveredAt', '交付日'),
    {
      key: 'email',
      label: 'メールアドレス',
      width: 150,
      renderHeader: filterHeader('email', 'メールアドレス'),
      render: (r) => <InlineText value={r.customer?.email ?? null} onSave={(v) => save(r, { email: v })} />,
    },
    textColumn('specialNotes', 'メモ・特記事項', 150),
  ];

  // 進捗のグループ(ET→成約→保留→失注→リスケ→新規訪問等)順に並べ、グループ内は商談日時昇順(要望)
  const rows = useMemo(() => {
    const filtered = rawRows.filter((r) =>
      Object.entries(filters).every(([key, sel]) => {
        if (!sel) return true;
        const fn = filterValueFns[key];
        return fn ? sel.has(fn(r)) : true;
      }),
    );
    return [...filtered].sort((a, b) => {
      const groupDiff = progressGroupOrder(a.progressStatusId) - progressGroupOrder(b.progressStatusId);
      if (groupDiff !== 0) return groupDiff;
      const at = a.meetingStartAt ? new Date(a.meetingStartAt).getTime() : Infinity;
      const bt = b.meetingStartAt ? new Date(b.meetingStartAt).getTime() : Infinity;
      return at - bt;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, filters, progressOptions]);

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">アポ実績管理</h1>
          <a href="/api/appointments/export" style={{ fontSize: 13 }}>
            CSV出力
          </a>
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <PresenceBar viewers={presence.viewers} />

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
          tableKey="appointments"
          columns={columns}
          rows={rows}
          total={data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          loading={isLoading}
          onPageChange={setPage}
          getRowId={(r) => r.id}
          onRowClick={(r) => setExpandedId((cur) => (cur === r.id ? null : r.id))}
          rowStyle={(r) => ({ background: progressBg(r.progressStatusId) })}
          fontSize={12}
          onCellFocus={presence.notifyFocus}
          onCellBlur={presence.notifyBlur}
          cellCursor={presence.cellCursor}
          expandedRowId={expandedId}
          renderExpanded={(r) => (
            <div>
              {r.contract && (
                <p style={{ fontSize: 13, marginBottom: 8 }}>
                  ✅ エントリー案件が作成済みです。 <a href="/contracts">エントリー管理一覧を見る →</a>
                </p>
              )}
              <div style={{ display: 'flex', gap: 24, marginBottom: 12, fontSize: 13 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 2 }}>商談形式</label>
                  <select value={r.meetingType} onChange={(e) => save(r, { meetingType: e.target.value })}>
                    <option value="VISIT">訪問</option>
                    <option value="GOOGLE_MEET">Google Meet</option>
                    <option value="PHONE">電話</option>
                    <option value="OTHER">その他</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 2 }}>訪問先住所</label>
                  <InlineText
                    value={r.visitAddress}
                    onSave={(v) => save(r, { visitAddress: v })}
                    style={{ border: '1px solid var(--color-border)', padding: 6, background: 'var(--color-surface)', borderRadius: 4 }}
                  />
                </div>
              </div>
              {r.calendarSyncStatus === 'ERROR' && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 4 }}>{r.calendarSyncError ?? 'カレンダー連携に失敗しました'}</p>
                  <button onClick={() => retryCalendarMutation.mutate(r.id)}>カレンダー連携を再試行</button>
                </div>
              )}
              <CommentsPanel entityType="APPOINTMENT" entityId={r.id} />
            </div>
          )}
        />
      </div>
    </AppLayout>
  );
}
