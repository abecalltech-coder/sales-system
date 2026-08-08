import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { InlineText, InlineSelect } from '../../components/InlineEdit';
import { CommentsPanel } from '../../components/CommentsPanel';
import { PresenceBar } from '../../components/PresenceBar';
import { useTossCases, useStatuses, useMe, TossCaseListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { formatDate, formatTime, isoToDateInput, isoToTimeInput, parseDateText, parseTimeText } from '../../lib/dateInput';
import { usePresence } from '../../lib/usePresence';

const CALL_DIRECTION_OPTIONS = [
  { id: '架電', label: '架電' },
  { id: '入電', label: '入電' },
];

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const inlineInputStyle = { border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', width: '100%', padding: 0 } as const;

export function TossCasesListPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statusId, setStatusId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 20;
  const queryClient = useQueryClient();

  const { data, isLoading } = useTossCases({ page, pageSize, keyword: keyword || undefined, statusId: statusId || undefined });
  const { data: me } = useMe();
  const presence = usePresence('TOSS_CASE', me?.id);
  const { data: statuses } = useStatuses('TOSS');
  const { data: preConfirmOptions } = useStatuses('TOSS_PRE_CONFIRM');
  const { data: progressOptions } = useStatuses('TOSS_PROGRESS');
  const { data: ngReasonOptions } = useStatuses('TOSS_NG_REASON');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ corporateName: '', contactName: '', phone: '', memo: '' });
  const [error, setError] = useState<string | null>(null);

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

  const callingFlagMutation = useMutation({
    mutationFn: (vars: { id: string; active: boolean }) => api.patch(`/toss-cases/${vars.id}/calling-flag`, { active: vars.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['toss-cases'] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;
  const statusColor = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#9ca3af';

  const columns: Column<TossCaseListItem>[] = [
    { key: 'tossDate', label: 'トス日', render: (r) => formatDate(r.receivedAt), width: 86 },
    { key: 'tossTime', label: 'トス時間', render: (r) => formatTime(r.receivedAt), width: 68 },
    {
      key: 'nextActionDate',
      label: '次回対応日',
      width: 92,
      render: (r) => (
        <input
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          defaultValue={isoToDateInput(r.nextActionAt)}
          onClick={stop}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const current = isoToDateInput(r.nextActionAt);
            if (raw === current) return;
            if (raw === '') {
              save(r, { nextActionAt: null });
              return;
            }
            const parsed = parseDateText(raw);
            if (!parsed) {
              setError('次回対応日はYYYY-MM-DD形式で入力してください(例: 2026-08-10)');
              e.target.value = current;
              return;
            }
            const time = isoToTimeInput(r.nextActionAt) || '00:00';
            save(r, { nextActionAt: new Date(`${parsed}T${time}`).toISOString() });
          }}
          style={inlineInputStyle}
        />
      ),
    },
    {
      key: 'nextActionTime',
      label: '対応時間',
      width: 74,
      render: (r) => (
        <input
          type="text"
          inputMode="numeric"
          placeholder="HH:MM"
          defaultValue={isoToTimeInput(r.nextActionAt)}
          onClick={stop}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const current = isoToTimeInput(r.nextActionAt);
            if (raw === current) return;
            if (raw === '') {
              save(r, { nextActionAt: null });
              return;
            }
            const parsed = parseTimeText(raw);
            if (!parsed) {
              setError('対応時間はHH:MM形式で入力してください(例: 14:30)');
              e.target.value = current;
              return;
            }
            const date = isoToDateInput(r.nextActionAt) || isoToDateInput(new Date().toISOString());
            save(r, { nextActionAt: new Date(`${date}T${parsed}`).toISOString() });
          }}
          style={inlineInputStyle}
        />
      ),
    },
    {
      key: 'apStaffName',
      label: 'AP',
      width: 80,
      render: (r) => <InlineText value={r.apStaffName} onSave={(v) => save(r, { apStaffName: v })} />,
    },
    {
      key: 'preConfirm',
      label: '前確',
      width: 90,
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
      render: (r) => <InlineText value={r.department} onSave={(v) => save(r, { department: v })} />,
    },
    {
      key: 'calling',
      label: '対応中',
      width: 74,
      render: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            callingFlagMutation.mutate({ id: r.id, active: !r.isCallingInProgress });
          }}
          style={{
            fontSize: 11,
            padding: '3px 6px',
            background: r.isCallingInProgress ? 'var(--color-danger)' : 'var(--color-surface)',
            color: r.isCallingInProgress ? '#fff' : 'inherit',
            border: '1px solid var(--color-border)',
          }}
        >
          {r.isCallingInProgress ? '架電中' : '架電開始'}
        </button>
      ),
    },
    {
      key: 'corporateName',
      label: '店舗名',
      width: 120,
      render: (r) => <InlineText value={r.customer?.corporateName} onSave={(v) => save(r, { corporateName: v })} style={{ fontWeight: 600 }} />,
    },
    {
      key: 'memo',
      label: '備考',
      width: 130,
      render: (r) => <InlineText value={r.memo} onSave={(v) => save(r, { memo: v })} />,
    },
    {
      key: 'contactName',
      label: '担当者名',
      width: 96,
      render: (r) => <InlineText value={r.customer?.contactName} onSave={(v) => save(r, { contactName: v })} />,
    },
    {
      key: 'phone',
      label: '店舗連絡先',
      width: 108,
      render: (r) => <InlineText value={r.customer?.phone} onSave={(v) => save(r, { phone: v })} />,
    },
    { key: 'prefecture', label: '地域', render: (r) => r.prefecture ?? '-', width: 72 },
    {
      key: 'address',
      label: '住所(都道府県から)',
      width: 170,
      render: (r) => <InlineText value={r.customer?.address} onSave={(v) => save(r, { address: v })} />,
    },
    {
      key: 'proposal',
      label: '提案',
      width: 110,
      render: (r) => <InlineText value={r.proposal} onSave={(v) => save(r, { proposal: v })} />,
    },
    {
      key: 'progress',
      label: '進捗',
      width: 90,
      render: (r) => (
        <InlineSelect
          value={r.progressStatusId}
          options={progressOptions?.map((s) => ({ id: s.id, label: s.displayName })) ?? []}
          onSave={(v) => save(r, { progressStatusId: v })}
        />
      ),
    },
    {
      key: 'ngReason',
      label: 'NG理由',
      width: 140,
      render: (r) => (
        <InlineSelect
          value={r.ngReasonStatusId}
          options={ngReasonOptions?.map((s) => ({ id: s.id, label: s.displayName })) ?? []}
          onSave={(v) => save(r, { ngReasonStatusId: v })}
        />
      ),
    },
    {
      key: 'listName',
      label: 'リスト',
      width: 96,
      render: (r) => <InlineText value={r.listName} onSave={(v) => save(r, { listName: v })} />,
    },
    {
      key: 'callDirection',
      label: '架電or入電',
      width: 90,
      render: (r) => <InlineSelect value={r.callDirection} options={CALL_DIRECTION_OPTIONS} onSave={(v) => save(r, { callDirection: v })} />,
    },
    {
      key: 'industry',
      label: '業種',
      width: 84,
      render: (r) => <InlineText value={r.industry} onSave={(v) => save(r, { industry: v })} />,
    },
    {
      key: 'hook',
      label: 'フック',
      width: 110,
      render: (r) => <InlineText value={r.hook} onSave={(v) => save(r, { hook: v })} />,
    },
    {
      key: 'existingContract',
      label: '既契約',
      width: 100,
      render: (r) => <InlineText value={r.existingContract} onSave={(v) => save(r, { existingContract: v })} />,
    },
    {
      key: 'status',
      label: 'ステータス',
      width: 110,
      render: (r) => (
        <InlineSelect
          value={r.statusId}
          options={statuses?.map((s) => ({ id: s.id, label: s.displayName })) ?? []}
          onSave={(v) => save(r, { statusId: v })}
          style={{
            background: statusColor(r.statusId),
            color: '#fff',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 600,
            textAlign: 'center',
          }}
        />
      ),
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
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          loading={isLoading}
          onPageChange={setPage}
          getRowId={(r) => r.id}
          onRowClick={(r) => setExpandedId((cur) => (cur === r.id ? null : r.id))}
          rowStyle={(r) => (r.isCallingInProgress ? { background: 'var(--color-danger-soft)' } : undefined)}
          fontSize={12}
          onCellFocus={presence.notifyFocus}
          onCellBlur={presence.notifyBlur}
          cellCursor={presence.cellCursor}
          expandedRowId={expandedId}
          renderExpanded={(r) => (
            <div>
              {r.appointment && (
                <p style={{ fontSize: 13, marginBottom: 12 }}>
                  ✅ アポ案件が作成済みです。 <Link to="/appointments">アポ実績一覧を見る →</Link>
                </p>
              )}
              <CommentsPanel entityType="TOSS_CASE" entityId={r.id} />
            </div>
          )}
        />
      </div>
    </AppLayout>
  );
}
