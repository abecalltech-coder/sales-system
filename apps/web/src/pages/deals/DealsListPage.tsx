import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { InlineText, InlineSelect, InlineFlexDate } from '../../components/InlineEdit';
import { DealListItem, DealFieldItem, useDeals, useDealFields, useUserOptions } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { isoToDateInput, parseDateText } from '../../lib/dateInput';
import { DealFieldsPanel } from './DealFieldsPanel';
import { QuickAddDealModal } from './QuickAddDealModal';

const MANAGE_OPTIONS = '__manage_options__';
const ADD_COLUMN_KEY = '__add_column__';

export function DealsListPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusFieldId, setFocusFieldId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const pageSize = 100;
  const queryClient = useQueryClient();

  const { data, isLoading } = useDeals({ page, pageSize, keyword: keyword || undefined });
  const { data: fields } = useDealFields();
  const { data: userOptions } = useUserOptions();

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
  const save = (row: DealListItem, patch: Record<string, unknown>) =>
    updateMutation.mutate({ id: row.id, version: row.version, patch });

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

  const rows = useMemo(() => data?.items ?? [], [data]);

  const fieldColumn = (field: DealFieldItem): Column<DealListItem> => {
    const key = field.fieldKey;
    if (field.dataType === 'DATE') {
      return {
        key,
        label: field.label,
        width: 100,
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

  const columns: Column<DealListItem>[] = useMemo(() => {
    const cols = (fields ?? []).map(fieldColumn);
    cols.push({
      key: ADD_COLUMN_KEY,
      label: '',
      width: 60,
      render: () => null,
      renderHeader: () => (
        <button onClick={() => openPanel()} title="列を追加・編集" style={{ fontSize: 14, padding: '1px 8px', fontWeight: 700 }}>
          ＋
        </button>
      ),
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, userOptions]);

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

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            placeholder="案件名で検索"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            style={{ padding: 6, fontSize: 13, width: 240 }}
          />
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
