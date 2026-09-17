import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { ColumnFilterHeader } from '../../components/ColumnFilterHeader';
import { InlineText, InlineSelect, InlineFlexDate } from '../../components/InlineEdit';
import { DealListItem, DealFieldItem, useDeals, useDealFields, useUserOptions, useMe } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { isoToDateInput, parseDateText } from '../../lib/dateInput';
import { DealFieldsPanel } from './DealFieldsPanel';
import { QuickAddDealModal } from './QuickAddDealModal';
import { PresenceBar } from '../../components/PresenceBar';
import { usePresence } from '../../lib/usePresence';
import { useBatchedRowSave } from '../../lib/useBatchedRowSave';

const MANAGE_OPTIONS = '__manage_options__';
const ADD_COLUMN_KEY = '__add_column__';
const ASSIGNEE_FIELD_KEY = 'assignee_user_id';
// 案件を「その人だけ」で絞り込む対象の役職(要望: CL・責任者ごとに表示)
const PERSON_FILTER_ROLES = ['CL', 'RESPONSIBLE'];

export function DealsListPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusFieldId, setFocusFieldId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({});
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const pageSize = 100;
  const queryClient = useQueryClient();

  const { data, isLoading, error: listError } = useDeals({ page, pageSize, keyword: keyword || undefined });
  const { data: fields } = useDealFields();
  const { data: userOptions } = useUserOptions();
  const { data: me } = useMe();
  const presence = usePresence('DEAL', me?.id);

  // 案件名で検索の右に出す「CL・責任者」の人物フィルター(要望: 押すとその人だけの案件を表示)
  const personFilterOptions = useMemo(
    () => (userOptions ?? []).filter((u) => u.roles.some((r) => PERSON_FILTER_ROLES.includes(r))),
    [userOptions],
  );

  const displayedError = error ?? (listError instanceof ApiError ? listError.message : listError ? '一覧の取得に失敗しました' : null);

  const openPanel = (fieldId?: string) => {
    setFocusFieldId(fieldId ?? null);
    setPanelOpen(true);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['deals'] });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; version: number; patch: Record<string, unknown> }) =>
      api.patch(`/deals/${vars.id}`, { version: vars.version, values: vars.patch }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });
  // 複数セル貼り付け等で同じ行に複数回書き込む際、行ごとに1回のPATCHへまとめて送る
  // (要望: バージョン競合で一部セル、特にプルダウン列が反映されない不具合の修正)
  const save = useBatchedRowSave<DealListItem, Record<string, unknown>>(
    (row) => row.id,
    (row, patch) => updateMutation.mutate({ id: row.id, version: row.version, patch }),
  );

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => api.post('/deals', { values }),
    onSuccess: () => {
      setError(null);
      setAddOpen(false);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '案件の追加に失敗しました'),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/deals/bulk-delete', { ids }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : '削除に失敗しました'),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/deals/reorder', { ids }),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : '並び替えに失敗しました'),
  });

  const invalidateFields = () => queryClient.invalidateQueries({ queryKey: ['deal-fields'] });

  // 列も行と同様に削除・並び替えできるように(要望)。列の管理パネルと同じAPIを使う。
  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: string) => api.delete(`/deals/fields/${fieldId}`),
    onSuccess: invalidateFields,
    onError: (err) => setError(err instanceof ApiError ? err.message : '列の削除に失敗しました'),
  });
  const reorderFieldsMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/deals/fields/reorder', { ids }),
    onSuccess: invalidateFields,
    onError: (err) => setError(err instanceof ApiError ? err.message : '列の並び替えに失敗しました'),
  });

  const rawRows = useMemo(() => data?.items ?? [], [data]);

  const fieldColumn = (field: DealFieldItem): Column<DealListItem> => {
    const key = field.fieldKey;
    if (field.dataType === 'DATE') {
      return {
        key,
        label: field.label,
        width: 130,
        render: (r) => (
          <InlineFlexDate
            iso={(r.values[key] as string | null) ?? null}
            label={field.label}
            onSave={(iso) => save(r, { [key]: iso })}
            onInvalid={setError}
          />
        ),
        copyValue: (r) => isoToDateInput((r.values[key] as string | null) ?? null),
        pasteValue: (r, text) => {
          const t = text.trim();
          if (!t) return save(r, { [key]: null });
          const p = parseDateText(t);
          if (p) save(r, { [key]: new Date(`${p}T00:00:00`).toISOString() });
        },
      };
    }
    if (field.dataType === 'SELECT') {
      const options = [...field.options].sort((a, b) => a.order - b.order);
      const labelOf = (id: string | null) => options.find((o) => o.id === id)?.label ?? '';
      return {
        key,
        label: field.label,
        width: 140,
        render: (r) => (
          <InlineSelect
            value={(r.values[key] as string | null) ?? ''}
            options={[
              ...options.map((o) => ({ id: o.id, label: o.label, color: o.color })),
              { id: MANAGE_OPTIONS, label: '＋ 選択肢を編集...' },
            ]}
            onSave={(v) => {
              if (v === MANAGE_OPTIONS) {
                openPanel(field.id);
                return;
              }
              save(r, { [key]: v || null });
            }}
            colored
            style={{ borderRadius: 999, padding: '2px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center' }}
          />
        ),
        copyValue: (r) => labelOf(r.values[key] as string | null),
        pasteValue: (r, text) => {
          const t = text.trim();
          if (!t) return save(r, { [key]: null });
          const m = options.find((o) => o.label === t);
          if (m) save(r, { [key]: m.id });
        },
      };
    }
    if (field.dataType === 'USER') {
      const nameOf = (id: string | null) => userOptions?.find((u) => u.id === id)?.name ?? '';
      return {
        key,
        label: field.label,
        width: 110,
        render: (r) => (
          <InlineSelect
            value={(r.values[key] as string | null) ?? ''}
            options={(userOptions ?? []).map((u) => ({ id: u.id, label: u.name }))}
            onSave={(v) => save(r, { [key]: v || null })}
          />
        ),
        copyValue: (r) => nameOf(r.values[key] as string | null),
        pasteValue: (r, text) => {
          const t = text.trim();
          if (!t) return save(r, { [key]: null });
          const m = userOptions?.find((u) => u.name === t);
          if (m) save(r, { [key]: m.id });
        },
      };
    }
    // TEXT
    return {
      key,
      label: field.label,
      width: 140,
      render: (r) => <InlineText value={(r.values[key] as string | null) ?? null} onSave={(v) => save(r, { [key]: v })} />,
      copyValue: (r) => (r.values[key] as string | null) ?? '',
      pasteValue: (r, text) => save(r, { [key]: text }),
    };
  };

  // 各項目の絞り込み(要望)。列に表示される文字列(copyValueと同じ変換)を選択肢にする。
  const optionsFor = (col: Column<DealListItem>) => {
    if (!col.copyValue) return [];
    const set = new Set<string>();
    for (const r of rawRows) set.add(col.copyValue(r));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  };
  const filterHeaderFor = (col: Column<DealListItem>) => () => (
    <ColumnFilterHeader
      label={col.label}
      options={optionsFor(col)}
      selected={filters[col.key] ?? null}
      onChange={(sel) => setFilters((f) => ({ ...f, [col.key]: sel }))}
    />
  );

  const columns: Column<DealListItem>[] = useMemo(() => {
    const cols = (fields ?? []).map(fieldColumn).map((col) => ({ ...col, renderHeader: filterHeaderFor(col) }));
    cols.push({
      key: ADD_COLUMN_KEY,
      label: '',
      width: 60,
      locked: true,
      render: () => null,
      renderHeader: () => (
        <button onClick={() => openPanel()} title="列を追加・編集" style={{ fontSize: 14, padding: '1px 8px', fontWeight: 700 }}>
          ＋
        </button>
      ),
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, userOptions, filters, rawRows]);

  const rows = useMemo(() => {
    let filtered = rawRows;
    if (Object.values(filters).some((sel) => sel != null)) {
      filtered = filtered.filter((r) =>
        Object.entries(filters).every(([key, sel]) => {
          if (!sel) return true;
          const col = columns.find((c) => c.key === key);
          return col?.copyValue ? sel.has(col.copyValue(r)) : true;
        }),
      );
    }
    if (personFilter) {
      filtered = filtered.filter((r) => r.values[ASSIGNEE_FIELD_KEY] === personFilter);
    }
    return filtered;
  }, [rawRows, filters, personFilter, columns]);

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">案件管理</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => openPanel()} style={{ fontSize: 13 }}>
              列を管理
            </button>
            <button className="btn-primary" onClick={() => setAddOpen(true)} style={{ fontSize: 13 }}>
              ＋ 案件追加
            </button>
          </div>
        </div>

        {displayedError && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{displayedError}</p>}

        <PresenceBar viewers={presence.viewers} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            placeholder="案件名で検索"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            style={{ padding: 6, fontSize: 13, width: 240 }}
          />
          {personFilterOptions.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {personFilterOptions.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setPersonFilter((cur) => (cur === u.id ? null : u.id))}
                  style={{
                    fontSize: 12,
                    padding: '4px 12px',
                    border: 'none',
                    borderRadius: 999,
                    fontWeight: personFilter === u.id ? 700 : 500,
                    background: personFilter === u.id ? 'var(--color-primary-soft)' : 'var(--color-subtle)',
                    color: personFilter === u.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  {u.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <DataTable
          tableKey="deals"
          columns={columns}
          rows={rows}
          total={data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          loading={isLoading}
          onPageChange={setPage}
          getRowId={(r) => r.id}
          onReorder={(ids) => reorderMutation.mutate(ids)}
          onDeleteRows={(ids) => deleteMutation.mutate(ids)}
          onDeleteColumn={(key) => {
            const id = fields?.find((f) => f.fieldKey === key)?.id;
            if (id) deleteFieldMutation.mutate(id);
          }}
          onReorderColumns={(keys) => {
            const ids = keys
              .filter((k) => k !== ADD_COLUMN_KEY)
              .map((k) => fields?.find((f) => f.fieldKey === k)?.id)
              .filter((id): id is string => !!id);
            reorderFieldsMutation.mutate(ids);
          }}
          onCellFocus={presence.notifyFocus}
          onCellBlur={presence.notifyBlur}
          cellCursor={presence.cellCursor}
        />
      </div>

      {panelOpen && <DealFieldsPanel onClose={() => setPanelOpen(false)} focusFieldId={focusFieldId} />}

      {addOpen && (
        <QuickAddDealModal
          fields={fields ?? []}
          submitting={createMutation.isPending}
          onCancel={() => setAddOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      )}
    </AppLayout>
  );
}
