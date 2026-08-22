import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { ColumnFilterHeader } from '../../components/ColumnFilterHeader';
import { InlineText, InlineSelect, InlineFlexDate, InlineFlexTime } from '../../components/InlineEdit';
import { PresenceBar } from '../../components/PresenceBar';
import { useTossCases, useStatuses, useMe, TossCaseListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { formatDate, formatTime, isoToDateInput, isoToTimeInput } from '../../lib/dateInput';
import { usePresence } from '../../lib/usePresence';

const CALL_DIRECTION_OPTIONS = [
  { id: '架電', label: '架電' },
  { id: '入電', label: '入電' },
];

type FilterValueFn = (r: TossCaseListItem) => string;

export function TossCasesListPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statusId, setStatusId] = useState('');
  // 列フィルター(Googleスプレッドシート風)。自分の画面だけのローカルstateで、他ユーザーには共有しない。
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({});
  // ステータスごとのグループ化・列フィルターをページ内で完結させるため、
  // 一覧APIの許容上限(ListQueryDto: 最大100件)いっぱいまで1ページで取得する
  const pageSize = 100;
  const queryClient = useQueryClient();

  const { data, isLoading } = useTossCases({ page, pageSize, keyword: keyword || undefined, statusId: statusId || undefined });
  const { data: me } = useMe();
  const presence = usePresence('TOSS_CASE', me?.id);
  const { data: statuses } = useStatuses('TOSS');
  const { data: preConfirmOptions } = useStatuses('TOSS_PRE_CONFIRM');
  const { data: progressOptions } = useStatuses('TOSS_PROGRESS');
  const { data: ngReasonOptions } = useStatuses('TOSS_NG_REASON');
  const { data: departmentOptions } = useStatuses('DEPARTMENT_BRANCH');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ corporateName: '', contactName: '', phone: '', memo: '' });
  const [error, setError] = useState<string | null>(null);

  // ステータスを「アポイント」に変更する際、前連日時の入力を必須にするための確認モーダル(セクション追加要望)。
  const [preContactModal, setPreContactModal] = useState<{ row: TossCaseListItem; statusId: string } | null>(null);
  const [preContactInput, setPreContactInput] = useState('');
  const [meetingAtInput, setMeetingAtInput] = useState('');
  const [preContactError, setPreContactError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.post<{ id: string }>('/toss-cases', form),
    onSuccess: () => {
      setError(null);
      setShowCreate(false);
      setForm({ corporateName: '', contactName: '', phone: '', memo: '' });
      queryClient.invalidateQueries({ queryKey: ['toss-cases'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '登録に失敗しました'),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; version: number; patch: Record<string, unknown> }) =>
      api.patch(`/toss-cases/${vars.id}`, { version: vars.version, ...vars.patch }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['toss-cases'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });
  const save = (row: TossCaseListItem, patch: Record<string, unknown>) =>
    updateMutation.mutate({ id: row.id, version: row.version, patch });

  const preContactMutation = useMutation({
    mutationFn: (vars: { id: string; version: number; statusId: string; initialPreContactAt: string; confirmedStartAt: string }) =>
      api.patch(`/toss-cases/${vars.id}`, {
        version: vars.version,
        statusId: vars.statusId,
        initialPreContactAt: vars.initialPreContactAt,
        confirmedStartAt: vars.confirmedStartAt,
      }),
    onSuccess: () => {
      setPreContactModal(null);
      setPreContactInput('');
      setMeetingAtInput('');
      setPreContactError(null);
      queryClient.invalidateQueries({ queryKey: ['toss-cases'] });
    },
    onError: (err) => setPreContactError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  const callingFlagMutation = useMutation({
    mutationFn: (vars: { id: string; active: boolean }) => api.patch(`/toss-cases/${vars.id}/calling-flag`, { active: vars.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['toss-cases'] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? '';
  const statusBg = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#ffffff';
  const statusGroupOrder = (id: string) => statuses?.find((s) => s.id === id)?.order ?? 999;

  const filterValueFns: Record<string, FilterValueFn> = {
    tossDate: (r) => formatDate(r.receivedAt),
    tossTime: (r) => formatTime(r.receivedAt),
    nextActionDate: (r) => isoToDateInput(r.nextActionAt),
    nextActionTime: (r) => isoToTimeInput(r.nextActionAt),
    apStaffName: (r) => r.apStaffName ?? '',
    preConfirm: (r) => preConfirmOptions?.find((s) => s.id === r.preConfirmStatusId)?.displayName ?? '',
    department: (r) => departmentOptions?.find((s) => s.id === r.department)?.displayName ?? '',
    calling: (r) => (r.isCallingInProgress ? '架電中' : ''),
    corporateName: (r) => r.customer?.corporateName ?? '',
    memo: (r) => r.memo ?? '',
    status: (r) => statusLabel(r.statusId),
    contactName: (r) => r.customer?.contactName ?? '',
    phone: (r) => r.customer?.phone ?? '',
    prefecture: (r) => r.prefecture ?? '',
    address: (r) => r.customer?.address ?? '',
    proposal: (r) => r.proposal ?? '',
    progress: (r) => progressOptions?.find((s) => s.id === r.progressStatusId)?.displayName ?? '',
    ngReason: (r) => ngReasonOptions?.find((s) => s.id === r.ngReasonStatusId)?.displayName ?? '',
    listName: (r) => r.listName ?? '',
    callDirection: (r) => r.callDirection ?? '',
    industry: (r) => r.industry ?? '',
    hook: (r) => r.hook ?? '',
    existingContract: (r) => r.existingContract ?? '',
  };

  const rawRows = useMemo(() => data?.items ?? [], [data]);

  const optionsFor = (key: string) => {
    const fn = filterValueFns[key];
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

  const rows = useMemo(() => {
    const filtered = rawRows.filter((r) =>
      Object.entries(filters).every(([key, sel]) => {
        if (!sel) return true;
        return sel.has(filterValueFns[key](r));
      }),
    );
    return [...filtered].sort((a, b) => {
      const groupDiff = statusGroupOrder(a.statusId) - statusGroupOrder(b.statusId);
      if (groupDiff !== 0) return groupDiff;
      const at = a.nextActionAt ? new Date(a.nextActionAt).getTime() : Infinity;
      const bt = b.nextActionAt ? new Date(b.nextActionAt).getTime() : Infinity;
      return at - bt;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, filters, statuses]);

  const columns: Column<TossCaseListItem>[] = [
    { key: 'tossDate', label: 'トス日', render: (r) => formatDate(r.receivedAt), width: 86, renderHeader: filterHeader('tossDate', 'トス日') },
    { key: 'tossTime', label: 'トス時間', render: (r) => formatTime(r.receivedAt), width: 68, renderHeader: filterHeader('tossTime', 'トス時間') },
    {
      key: 'nextActionDate',
      label: '次回対応日',
      width: 92,
      renderHeader: filterHeader('nextActionDate', '次回対応日'),
      render: (r) => (
        <InlineFlexDate iso={r.nextActionAt} label="次回対応日" onSave={(iso) => save(r, { nextActionAt: iso })} onInvalid={setError} />
      ),
    },
    {
      key: 'nextActionTime',
      label: '対応時間',
      width: 74,
      renderHeader: filterHeader('nextActionTime', '対応時間'),
      render: (r) => (
        <InlineFlexTime iso={r.nextActionAt} label="対応時間" onSave={(iso) => save(r, { nextActionAt: iso })} onInvalid={setError} />
      ),
    },
    {
      key: 'apStaffName',
      label: 'AP',
      width: 80,
      renderHeader: filterHeader('apStaffName', 'AP'),
      render: (r) => <InlineText value={r.apStaffName} onSave={(v) => save(r, { apStaffName: v })} />,
    },
    {
      key: 'preConfirm',
      label: '前確',
      width: 90,
      renderHeader: filterHeader('preConfirm', '前確'),
      render: (r) => (
        <InlineSelect
          value={r.preConfirmStatusId}
          options={preConfirmOptions?.map((s) => ({ id: s.id, label: s.displayName })) ?? []}
          onSave={(v) => save(r, { preConfirmStatusId: v })}
        />
      ),
    },
    {
      key: 'department',
      label: '部署',
      width: 84,
      renderHeader: filterHeader('department', '部署'),
      render: (r) => (
        <InlineSelect
          value={r.department}
          options={departmentOptions?.map((s) => ({ id: s.id, label: s.displayName })) ?? []}
          onSave={(v) => save(r, { department: v })}
        />
      ),
    },
    {
      key: 'calling',
      label: '対応中',
      width: 96,
      renderHeader: filterHeader('calling', '対応中'),
      render: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            callingFlagMutation.mutate({ id: r.id, active: !r.isCallingInProgress });
          }}
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '5px 10px',
            borderRadius: 999,
            border: r.isCallingInProgress ? '1px solid var(--color-danger)' : '1px solid var(--color-border-strong)',
            background: r.isCallingInProgress ? 'var(--color-danger)' : 'var(--color-surface)',
            color: r.isCallingInProgress ? '#fff' : 'var(--color-text)',
            boxShadow: r.isCallingInProgress ? '0 0 0 3px var(--color-danger-soft)' : 'none',
            whiteSpace: 'nowrap',
            transition: 'background-color 0.12s ease, box-shadow 0.12s ease',
          }}
        >
          {r.isCallingInProgress ? '● 架電中' : '架電開始'}
        </button>
      ),
    },
    {
      key: 'corporateName',
      label: '店舗名',
      width: 170,
      renderHeader: filterHeader('corporateName', '店舗名'),
      render: (r) => <InlineText value={r.customer?.corporateName} onSave={(v) => save(r, { corporateName: v })} style={{ fontWeight: 600 }} />,
    },
    {
      key: 'memo',
      label: '備考',
      width: 320,
      renderHeader: filterHeader('memo', '備考'),
      render: (r) => <InlineText value={r.memo} onSave={(v) => save(r, { memo: v })} />,
    },
    {
      key: 'status',
      label: 'ステータス',
      width: 100,
      renderHeader: filterHeader('status', 'ステータス'),
      render: (r) => (
        <InlineSelect
          value={r.statusId}
          options={statuses?.map((s) => ({ id: s.id, label: s.displayName })) ?? []}
          onSave={(v) => {
            const internalCode = statuses?.find((s) => s.id === v)?.internalCode;
            if (internalCode === 'TOSS_APPOINTMENT') {
              setPreContactModal({ row: r, statusId: v });
              setPreContactInput('');
              setMeetingAtInput('');
              setPreContactError(null);
            } else {
              save(r, { statusId: v });
            }
          }}
          hideBlankOption
          style={{ fontWeight: 600 }}
        />
      ),
    },
    {
      key: 'contactName',
      label: '担当者名',
      width: 96,
      renderHeader: filterHeader('contactName', '担当者名'),
      render: (r) => <InlineText value={r.customer?.contactName} onSave={(v) => save(r, { contactName: v })} />,
    },
    {
      key: 'phone',
      label: '店舗連絡先',
      width: 108,
      renderHeader: filterHeader('phone', '店舗連絡先'),
      render: (r) => <InlineText value={r.customer?.phone} onSave={(v) => save(r, { phone: v })} />,
    },
    { key: 'prefecture', label: '地域', render: (r) => r.prefecture ?? '-', width: 72, renderHeader: filterHeader('prefecture', '地域') },
    {
      key: 'address',
      label: '住所(都道府県から)',
      width: 170,
      renderHeader: filterHeader('address', '住所'),
      render: (r) => <InlineText value={r.customer?.address} onSave={(v) => save(r, { address: v })} />,
    },
    {
      key: 'proposal',
      label: '提案',
      width: 110,
      renderHeader: filterHeader('proposal', '提案'),
      render: (r) => <InlineText value={r.proposal} onSave={(v) => save(r, { proposal: v })} />,
    },
    {
      key: 'progress',
      label: '進捗',
      width: 100,
      renderHeader: filterHeader('progress', '進捗'),
      render: (r) => (
        <InlineSelect
          value={r.progressStatusId}
          options={progressOptions?.map((s) => ({ id: s.id, label: s.displayName, color: s.color })) ?? []}
          onSave={(v) => save(r, { progressStatusId: v })}
          colored
        />
      ),
    },
    {
      key: 'ngReason',
      label: 'NG理由',
      width: 150,
      renderHeader: filterHeader('ngReason', 'NG理由'),
      render: (r) => (
        <InlineSelect
          value={r.ngReasonStatusId}
          options={ngReasonOptions?.map((s) => ({ id: s.id, label: s.displayName, color: s.color })) ?? []}
          onSave={(v) => save(r, { ngReasonStatusId: v })}
          colored
        />
      ),
    },
    {
      key: 'listName',
      label: 'リスト',
      width: 96,
      renderHeader: filterHeader('listName', 'リスト'),
      render: (r) => <InlineText value={r.listName} onSave={(v) => save(r, { listName: v })} />,
    },
    {
      key: 'callDirection',
      label: '架電or入電',
      width: 90,
      renderHeader: filterHeader('callDirection', '架電or入電'),
      render: (r) => <InlineSelect value={r.callDirection} options={CALL_DIRECTION_OPTIONS} onSave={(v) => save(r, { callDirection: v })} />,
    },
    {
      key: 'industry',
      label: '業種',
      width: 84,
      renderHeader: filterHeader('industry', '業種'),
      render: (r) => <InlineText value={r.industry} onSave={(v) => save(r, { industry: v })} />,
    },
    {
      key: 'hook',
      label: 'フック',
      width: 110,
      renderHeader: filterHeader('hook', 'フック'),
      render: (r) => <InlineText value={r.hook} onSave={(v) => save(r, { hook: v })} />,
    },
    {
      key: 'existingContract',
      label: '既契約',
      width: 100,
      renderHeader: filterHeader('existingContract', '既契約'),
      render: (r) => <InlineText value={r.existingContract} onSave={(v) => save(r, { existingContract: v })} />,
    },
  ];

  return (
    <AppLayout>
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22 }}>トス実績</h1>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <a href="/api/toss-cases/export" style={{ fontSize: 13 }}>
              CSV出力
            </a>
            <button className="btn-primary" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? '閉じる' : '＋ 新規案件'}
            </button>
          </div>
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {showCreate && (
          <div className="card" style={{ marginBottom: 20, maxWidth: 480 }}>
            <div style={{ marginBottom: 10 }}>
              <label>店舗名</label>
              <input
                value={form.corporateName}
                onChange={(e) => setForm({ ...form, corporateName: e.target.value })}
                placeholder="例: 〇〇株式会社"
                style={{ display: 'block', width: '100%', marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>顧客担当者</label>
              <input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                style={{ display: 'block', width: '100%', marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>電話番号</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                style={{ display: 'block', width: '100%', marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label>メモ</label>
              <textarea
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                style={{ display: 'block', width: '100%', marginTop: 4, minHeight: 60 }}
              />
            </div>
            <button className="btn-primary" onClick={() => createMutation.mutate()} disabled={!form.corporateName || createMutation.isPending}>
              登録する
            </button>
          </div>
        )}

        <PresenceBar viewers={presence.viewers} />

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            placeholder="店舗名・備考で検索"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            style={{ width: 280 }}
          />
          <select
            value={statusId}
            onChange={(e) => {
              setStatusId(e.target.value);
              setPage(1);
            }}
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
          rows={rows}
          total={data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          loading={isLoading}
          onPageChange={setPage}
          getRowId={(r) => r.id}
          rowStyle={(r) => ({ background: r.isCallingInProgress ? 'var(--color-danger-soft)' : statusBg(r.statusId) })}
          fontSize={12}
          onCellFocus={presence.notifyFocus}
          onCellBlur={presence.notifyBlur}
          cellCursor={presence.cellCursor}
        />
      </div>

      {preContactModal && (
        <div
          onClick={() => setPreContactModal(null)}
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
            style={{ width: 360, background: 'var(--color-surface)', padding: 20, borderRadius: 10 }}
          >
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>前連日時・商談日時を入力してください</h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
              「{preContactModal.row.customer?.corporateName ?? '(店舗名未設定)'}」をアポイントへ変更します。
              前連日時はアポ実績に反映され、CLカレンダーに30分予定として登録されます。
              商談日時はアポ実績の商談日/商談時間・カレンダーの予定日時・備考欄に反映されます。
            </p>
            <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>前連日時</label>
            <input
              type="datetime-local"
              value={preContactInput}
              onChange={(e) => setPreContactInput(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: 12 }}
            />
            <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>商談日時</label>
            <input
              type="datetime-local"
              value={meetingAtInput}
              onChange={(e) => setMeetingAtInput(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: 12 }}
            />
            {preContactError && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 10 }}>{preContactError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setPreContactModal(null)}>キャンセル</button>
              <button
                className="btn-primary"
                disabled={!preContactInput || !meetingAtInput || preContactMutation.isPending}
                onClick={() => {
                  if (!preContactInput || !meetingAtInput) {
                    setPreContactError('前連日時・商談日時を入力してください');
                    return;
                  }
                  preContactMutation.mutate({
                    id: preContactModal.row.id,
                    version: preContactModal.row.version,
                    statusId: preContactModal.statusId,
                    initialPreContactAt: new Date(preContactInput).toISOString(),
                    confirmedStartAt: new Date(meetingAtInput).toISOString(),
                  });
                }}
              >
                確定してアポイントへ変更
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
