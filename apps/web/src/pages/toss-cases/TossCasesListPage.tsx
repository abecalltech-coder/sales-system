import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { ColumnFilterHeader } from '../../components/ColumnFilterHeader';
import { InlineText, InlineSelect, InlineFlexDate, InlineFlexTime } from '../../components/InlineEdit';
import { PresenceBar } from '../../components/PresenceBar';
import { useTossCases, useStatuses, useMe, TossCaseListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { formatDate, formatTime, isoToDateInput, isoToTimeInput, parseDateText, parseTimeText } from '../../lib/dateInput';
import { usePresence } from '../../lib/usePresence';
import { pastel } from '../../lib/color';
import { useManualSort } from '../../hooks/useManualSort';

const CALL_DIRECTION_OPTIONS = [
  { id: '架電', label: '架電' },
  { id: '入電', label: '入電' },
];

type FilterValueFn = (r: TossCaseListItem) => string;

export function TossCasesListPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  // 列フィルター(Googleスプレッドシート風)。自分の画面だけのローカルstateで、他ユーザーには共有しない。
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({});
  // 進捗ごとのグループ化・列フィルターをページ内で完結させるため、
  // 一覧APIの許容上限(ListQueryDto: 最大100件)いっぱいまで1ページで取得する
  const pageSize = 100;
  const queryClient = useQueryClient();
  const manualSort = useManualSort('toss-cases', '/toss-cases/reorder', 'toss-cases');

  const { data, isLoading } = useTossCases({ page, pageSize, keyword: keyword || undefined });
  const { data: me } = useMe();
  const presence = usePresence('TOSS_CASE', me?.id);
  const { data: preConfirmOptions } = useStatuses('TOSS_PRE_CONFIRM');
  const { data: progressOptions } = useStatuses('TOSS_PROGRESS');
  const { data: ngReasonOptions } = useStatuses('TOSS_NG_REASON');
  const { data: departmentOptions } = useStatuses('DEPARTMENT_BRANCH');
  const { data: meetingFormatOptions } = useStatuses('MEETING_FORMAT');
  const { data: industryOptions } = useStatuses('INDUSTRY');
  const { data: existingContractOptions } = useStatuses('EXISTING_CONTRACT');
  const { data: proposalOptions } = useStatuses('PROPOSAL_LOCATION');
  const labelOpts = (rows?: { displayName: string }[]) => (rows ?? []).map((o) => ({ id: o.displayName, label: o.displayName }));
  const hookSelectOptions = labelOpts(meetingFormatOptions);
  // コピー/貼り付け用: id→表示名、表示名→id
  const idOptLabel = (opts: { id: string; displayName: string }[] | undefined, id: string | null | undefined) =>
    opts?.find((s) => s.id === id)?.displayName ?? '';
  const idOptByLabel = (opts: { id: string; displayName: string }[] | undefined, text: string) => {
    const t = text.trim();
    return opts?.find((s) => s.displayName === t || s.displayName.toLowerCase() === t.toLowerCase())?.id ?? null;
  };

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ corporateName: '', contactName: '', phone: '', memo: '' });
  const [error, setError] = useState<string | null>(null);

  // ステータスを「アポイント」に変更する際、前連日時の入力を必須にするための確認モーダル(セクション追加要望)。
  const [preContactModal, setPreContactModal] = useState<{ row: TossCaseListItem; progressStatusId: string } | null>(null);
  const [preContactInput, setPreContactInput] = useState('');
  const [meetingAtInput, setMeetingAtInput] = useState('');
  const [meetingFormatInput, setMeetingFormatInput] = useState('');
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
    mutationFn: (vars: {
      id: string;
      version: number;
      progressStatusId: string;
      initialPreContactAt: string;
      confirmedStartAt: string;
      hook: string;
    }) =>
      api.patch(`/toss-cases/${vars.id}`, {
        version: vars.version,
        progressStatusId: vars.progressStatusId,
        initialPreContactAt: vars.initialPreContactAt,
        confirmedStartAt: vars.confirmedStartAt,
        hook: vars.hook,
      }),
    onSuccess: () => {
      setPreContactModal(null);
      setPreContactInput('');
      setMeetingAtInput('');
      setMeetingFormatInput('');
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

  // トスの状況管理は進捗(TOSS_PROGRESS)に一本化。グループ順・行色も進捗から取る。
  // 行の塗りつぶしは淡くする(要望: 濃くて見づらい)
  const progressBg = (id: string | null) => pastel(progressOptions?.find((s) => s.id === id)?.color, 0.88) ?? '#ffffff';
  const progressGroupOrder = (id: string | null) => progressOptions?.find((s) => s.id === id)?.order ?? 999;
  const progressInternalCode = (id: string) => progressOptions?.find((s) => s.id === id)?.internalCode;

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
    if (manualSort.manual) return manualSort.applySort(filtered);
    return [...filtered].sort((a, b) => {
      const groupDiff = progressGroupOrder(a.progressStatusId) - progressGroupOrder(b.progressStatusId);
      if (groupDiff !== 0) return groupDiff;
      const at = a.nextActionAt ? new Date(a.nextActionAt).getTime() : Infinity;
      const bt = b.nextActionAt ? new Date(b.nextActionAt).getTime() : Infinity;
      return at - bt;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, filters, progressOptions, manualSort.manual]);

  const columns: Column<TossCaseListItem>[] = [
    {
      key: 'tossDate',
      label: 'トス日',
      render: (r) => formatDate(r.receivedAt),
      width: 86,
      renderHeader: filterHeader('tossDate', 'トス日'),
      copyValue: (r) => formatDate(r.receivedAt),
    },
    {
      key: 'tossTime',
      label: 'トス時間',
      render: (r) => formatTime(r.receivedAt),
      width: 68,
      renderHeader: filterHeader('tossTime', 'トス時間'),
      copyValue: (r) => formatTime(r.receivedAt),
    },
    {
      key: 'nextActionDate',
      label: '次回対応日',
      width: 92,
      renderHeader: filterHeader('nextActionDate', '次回対応日'),
      render: (r) => (
        <InlineFlexDate iso={r.nextActionAt} label="次回対応日" onSave={(iso) => save(r, { nextActionAt: iso })} onInvalid={setError} />
      ),
      copyValue: (r) => isoToDateInput(r.nextActionAt),
      pasteValue: (r, text) => {
        const t = text.trim();
        if (!t) return save(r, { nextActionAt: null });
        const p = parseDateText(t);
        if (p) save(r, { nextActionAt: new Date(`${p}T${isoToTimeInput(r.nextActionAt) || '00:00'}`).toISOString() });
      },
    },
    {
      key: 'nextActionTime',
      label: '対応時間',
      width: 74,
      renderHeader: filterHeader('nextActionTime', '対応時間'),
      render: (r) => (
        <InlineFlexTime iso={r.nextActionAt} label="対応時間" onSave={(iso) => save(r, { nextActionAt: iso })} onInvalid={setError} />
      ),
      copyValue: (r) => isoToTimeInput(r.nextActionAt),
      pasteValue: (r, text) => {
        const p = parseTimeText(text.trim());
        if (p && r.nextActionAt) save(r, { nextActionAt: new Date(`${isoToDateInput(r.nextActionAt)}T${p}`).toISOString() });
      },
    },
    {
      key: 'apStaffName',
      label: 'AP',
      width: 80,
      renderHeader: filterHeader('apStaffName', 'AP'),
      render: (r) => <InlineText value={r.apStaffName} onSave={(v) => save(r, { apStaffName: v })} />,
      copyValue: (r) => r.apStaffName ?? '',
      pasteValue: (r, text) => save(r, { apStaffName: text }),
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
      copyValue: (r) => idOptLabel(preConfirmOptions, r.preConfirmStatusId),
      pasteValue: (r, text) => save(r, { preConfirmStatusId: idOptByLabel(preConfirmOptions, text) }),
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
      copyValue: (r) => idOptLabel(departmentOptions, r.department),
      pasteValue: (r, text) => save(r, { department: idOptByLabel(departmentOptions, text) }),
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
      copyValue: (r) => r.customer?.corporateName ?? '',
      pasteValue: (r, text) => save(r, { corporateName: text }),
    },
    {
      key: 'memo',
      label: '備考',
      width: 320,
      renderHeader: filterHeader('memo', '備考'),
      render: (r) => <InlineText value={r.memo} onSave={(v) => save(r, { memo: v })} expand />,
      copyValue: (r) => r.memo ?? '',
      pasteValue: (r, text) => save(r, { memo: text }),
    },
    {
      key: 'contactName',
      label: '担当者名',
      width: 96,
      renderHeader: filterHeader('contactName', '担当者名'),
      render: (r) => <InlineText value={r.customer?.contactName} onSave={(v) => save(r, { contactName: v })} />,
      copyValue: (r) => r.customer?.contactName ?? '',
      pasteValue: (r, text) => save(r, { contactName: text }),
    },
    {
      key: 'phone',
      label: '店舗連絡先',
      width: 108,
      renderHeader: filterHeader('phone', '店舗連絡先'),
      render: (r) => <InlineText value={r.customer?.phone} onSave={(v) => save(r, { phone: v })} />,
      copyValue: (r) => r.customer?.phone ?? '',
      pasteValue: (r, text) => save(r, { phone: text }),
    },
    {
      key: 'prefecture',
      label: '地域',
      render: (r) => r.prefecture ?? '-',
      width: 72,
      renderHeader: filterHeader('prefecture', '地域'),
      copyValue: (r) => r.prefecture ?? '',
    },
    {
      key: 'address',
      label: '住所(都道府県から)',
      width: 170,
      renderHeader: filterHeader('address', '住所'),
      render: (r) => <InlineText value={r.customer?.address} onSave={(v) => save(r, { address: v })} />,
      copyValue: (r) => r.customer?.address ?? '',
      pasteValue: (r, text) => save(r, { address: text }),
    },
    {
      key: 'proposal',
      label: '提案',
      width: 110,
      renderHeader: filterHeader('proposal', '提案'),
      render: (r) => <InlineSelect value={r.proposal} options={labelOpts(proposalOptions)} onSave={(v) => save(r, { proposal: v })} />,
      copyValue: (r) => r.proposal ?? '',
      pasteValue: (r, text) => save(r, { proposal: text.trim() || null }),
    },
    {
      key: 'progress',
      label: '進捗(状況)',
      width: 110,
      renderHeader: filterHeader('progress', '進捗'),
      render: (r) => (
        <InlineSelect
          value={r.progressStatusId}
          options={progressOptions?.map((s) => ({ id: s.id, label: s.displayName, color: s.color })) ?? []}
          onSave={(v) => {
            // 「アポイント」に変えたら前連日時・商談日時・商談形式の入力を求め、アポ詳細を自動生成する
            if (progressInternalCode(v) === 'PROGRESS_APPOINTMENT') {
              setPreContactModal({ row: r, progressStatusId: v });
              setPreContactInput('');
              setMeetingAtInput('');
              setMeetingFormatInput(r.hook ?? '');
              setPreContactError(null);
            } else {
              save(r, { progressStatusId: v });
            }
          }}
          colored
        />
      ),
      copyValue: (r) => idOptLabel(progressOptions, r.progressStatusId),
      pasteValue: (r, text) => {
        const id = idOptByLabel(progressOptions, text);
        // 貼り付けでアポイントに変えると詳細フォーマット入力を挟めないため、アポイントへの一括変更は無視する
        if (id && progressInternalCode(id) !== 'PROGRESS_APPOINTMENT') save(r, { progressStatusId: id });
      },
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
      copyValue: (r) => idOptLabel(ngReasonOptions, r.ngReasonStatusId),
      pasteValue: (r, text) => save(r, { ngReasonStatusId: idOptByLabel(ngReasonOptions, text) }),
    },
    {
      key: 'listName',
      label: 'リスト',
      width: 96,
      renderHeader: filterHeader('listName', 'リスト'),
      render: (r) => <InlineText value={r.listName} onSave={(v) => save(r, { listName: v })} />,
      copyValue: (r) => r.listName ?? '',
      pasteValue: (r, text) => save(r, { listName: text }),
    },
    {
      key: 'callDirection',
      label: '架電or入電',
      width: 90,
      renderHeader: filterHeader('callDirection', '架電or入電'),
      render: (r) => <InlineSelect value={r.callDirection} options={CALL_DIRECTION_OPTIONS} onSave={(v) => save(r, { callDirection: v })} />,
      copyValue: (r) => r.callDirection ?? '',
      pasteValue: (r, text) => {
        const t = text.trim();
        if (!t || t === '架電' || t === '入電') save(r, { callDirection: t || null });
      },
    },
    {
      key: 'industry',
      label: '業種',
      width: 96,
      renderHeader: filterHeader('industry', '業種'),
      render: (r) => <InlineSelect value={r.industry} options={labelOpts(industryOptions)} onSave={(v) => save(r, { industry: v })} />,
      copyValue: (r) => r.industry ?? '',
      pasteValue: (r, text) => save(r, { industry: text.trim() || null }),
    },
    {
      key: 'hook',
      label: 'フック(商談形式)',
      width: 110,
      renderHeader: filterHeader('hook', 'フック'),
      render: (r) => <InlineSelect value={r.hook} options={hookSelectOptions} onSave={(v) => save(r, { hook: v })} />,
      copyValue: (r) => r.hook ?? '',
      pasteValue: (r, text) => save(r, { hook: text.trim() || null }),
    },
    {
      key: 'existingContract',
      label: '既契約',
      width: 110,
      renderHeader: filterHeader('existingContract', '既契約'),
      render: (r) => (
        <InlineSelect value={r.existingContract} options={labelOpts(existingContractOptions)} onSave={(v) => save(r, { existingContract: v })} />
      ),
      copyValue: (r) => r.existingContract ?? '',
      pasteValue: (r, text) => save(r, { existingContract: text.trim() || null }),
    },
  ];

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">トス実績</h1>
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

        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <input
            placeholder="店舗名・備考で検索"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            style={{ width: 280 }}
          />
          {manualSort.manual && (
            <button onClick={manualSort.resetToAuto} style={{ fontSize: 12 }}>
              自動並びに戻す
            </button>
          )}
        </div>

        <DataTable
          tableKey="toss-cases"
          columns={columns}
          rows={rows}
          total={data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          loading={isLoading}
          onPageChange={setPage}
          getRowId={(r) => r.id}
          rowStyle={(r) => ({ background: r.isCallingInProgress ? 'var(--color-danger-soft)' : progressBg(r.progressStatusId) })}
          onCellFocus={presence.notifyFocus}
          onCellBlur={presence.notifyBlur}
          cellCursor={presence.cellCursor}
          onReorder={manualSort.reorder}
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
            <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>商談形式(フック)</label>
            <select
              value={meetingFormatInput}
              onChange={(e) => setMeetingFormatInput(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: 12 }}
            >
              <option value="">選択してください</option>
              {(meetingFormatOptions ?? []).map((o) => (
                <option key={o.id} value={o.displayName}>
                  {o.displayName}
                </option>
              ))}
              {meetingFormatInput && !(meetingFormatOptions ?? []).some((o) => o.displayName === meetingFormatInput) && (
                <option value={meetingFormatInput}>{meetingFormatInput}</option>
              )}
            </select>
            <p style={{ fontSize: 11, color: 'var(--color-text-faint)', marginBottom: 10 }}>
              HPZOOMはオンライン用フォーマット、それ以外は訪問用フォーマットで備考(アポ詳細)が生成されます。
            </p>
            {preContactError && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 10 }}>{preContactError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setPreContactModal(null)}>キャンセル</button>
              <button
                className="btn-primary"
                disabled={!preContactInput || !meetingAtInput || !meetingFormatInput || preContactMutation.isPending}
                onClick={() => {
                  if (!preContactInput || !meetingAtInput || !meetingFormatInput) {
                    setPreContactError('前連日時・商談日時・商談形式を入力してください');
                    return;
                  }
                  preContactMutation.mutate({
                    id: preContactModal.row.id,
                    version: preContactModal.row.version,
                    progressStatusId: preContactModal.progressStatusId,
                    initialPreContactAt: new Date(preContactInput).toISOString(),
                    confirmedStartAt: new Date(meetingAtInput).toISOString(),
                    hook: meetingFormatInput,
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
