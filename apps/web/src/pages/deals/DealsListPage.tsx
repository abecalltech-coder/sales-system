import { CSSProperties, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import type { MobileCardConfig } from '../../components/MobileCardList';
import { ColumnFilterHeader } from '../../components/ColumnFilterHeader';
import { InlineText, InlineSelect, InlineFlexDate } from '../../components/InlineEdit';
import { DealListItem, DealFieldItem, useDeals, useDealFields, useUserOptions, useMe, useMasterOrder } from '../../hooks/useApi';
import { applySavedOrder, rowColorStyle } from '../../lib/rowColors';
import { api, ApiError } from '../../lib/api';
import { isoToDateInput, parseDateText } from '../../lib/dateInput';
import { DealFieldsPanel } from './DealFieldsPanel';
import { QuickAddDealModal } from './QuickAddDealModal';
import { BulkImportDealsModal } from './BulkImportDealsModal';
import { DEAL_USER_OTHER, DEAL_USER_OTHER_LABEL } from '../../lib/dealUsers';
import { PresenceBar } from '../../components/PresenceBar';
import { usePresence } from '../../lib/usePresence';
import { useBatchedRowSave } from '../../lib/useBatchedRowSave';

const MANAGE_OPTIONS = '__manage_options__';
const ADD_COLUMN_KEY = '__add_column__';
const ASSIGNEE_FIELD_KEY = 'assignee_user_id';
// 案件を「その人だけ」で絞り込む対象の役職(要望: CL・責任者ごとに表示)
const PERSON_FILTER_ROLES = ['CL', 'RESPONSIBLE', 'GENERAL_RESPONSIBLE'];
// 店サポ解約誘導日が当月以前かつ店サポ解約誘導進捗が未のとき行を赤紫にする(要望)。
// 「未」は選択肢として明示的に選ばれている場合だけでなく、未入力(空欄)の行も対象に含める
// (本番データでは「未」を選ばず空欄のまま運用している行がほとんどだったため)。
// 当月になったらより濃くする(要望: 当月は特に目立たせたい / 当月以前は温度感を高くしたい)。
const SHOP_SUPPORT_DATE_KEY = 'shop_support_cancel_date';
const SHOP_SUPPORT_STATUS_KEY = 'shop_support_cancel_status';
const SHOP_SUPPORT_STATUS_DONE_LABEL = '済';
const SHOP_SUPPORT_BG_PAST = 'rgba(190, 24, 93, 0.16)'; // 当月より前(薄い赤紫)
const SHOP_SUPPORT_BG_CURRENT = 'rgba(190, 24, 93, 0.38)'; // 当月(濃い赤紫)

/** 対象の日付が当月より前/当月/当月より後のどれかを、日を見ず年月だけで判定する */
/** 先頭(固定列)は申込名義、2列目は案件名(要望)。列の並び替えをしてもこの2列は動かさない */
const LEADING_FIELD_KEYS = ['application_name', 'case_name'];
function pinLeadingFields(fields: DealFieldItem[] | undefined): DealFieldItem[] | undefined {
  if (!fields) return fields;
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const lead = LEADING_FIELD_KEYS.map((k) => sorted.find((f) => f.fieldKey === k)).filter((f): f is DealFieldItem => !!f);
  return [...lead, ...sorted.filter((f) => !LEADING_FIELD_KEYS.includes(f.fieldKey))];
}

function monthCompareToNow(iso: string | null | undefined): 'past' | 'current' | 'future' | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const dKey = d.getFullYear() * 12 + d.getMonth();
  const nowKey = now.getFullYear() * 12 + now.getMonth();
  if (dKey < nowKey) return 'past';
  if (dKey === nowKey) return 'current';
  return 'future';
}

export function DealsListPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusFieldId, setFocusFieldId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  // 列の絞り込みの中の昇順・降順(要望)。自分の画面だけ(保存・共有しない)
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({});
  // 列の絞り込みポップオーバー内で検索した文字列(列ごと)。チェックが入っている値に加え、
  // ここにヒットする値も一覧に表示する(要望: 絞り込み内検索がそのまま一覧表示に反映されるように)
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  // 全件を1ページで表示する(要望: 100件までの表示上限を無くす)
  const pageSize = 100000;
  const queryClient = useQueryClient();

  // 検索は全項目を対象にクライアント側で行う(要望: 案件名だけでなく全項目を検索対象に)。
  // 既に全件をクライアントに読み込んでいるため、キーワードをAPIへ送らず即座に絞り込める。
  const { data, isLoading, error: listError } = useDeals({ page, pageSize });
  const { data: rawFields } = useDealFields();
  const fields = useMemo(() => pinLeadingFields(rawFields), [rawFields]);
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

  // 店サポ解約誘導日が当月以前 かつ 店サポ解約誘導進捗が「未」(空欄含む)の行を薄い赤で塗る(要望)
  const shopSupportDoneOptionId = fields
    ?.find((f) => f.fieldKey === SHOP_SUPPORT_STATUS_KEY)
    ?.options.find((o) => o.label === SHOP_SUPPORT_STATUS_DONE_LABEL)?.id;
  // プルダウン列の選択肢に設定した塗りつぶし・文字色(マスタ管理 > 案件管理)。上にある列ほど優先(要望)
  const { data: masterOrder } = useMasterOrder();
  const colorFields = useMemo(() => {
    const selects = [...(fields ?? [])].filter((f) => f.dataType === 'SELECT').sort((a, b) => a.order - b.order);
    const keys = applySavedOrder(
      selects.map((f) => f.fieldKey),
      masterOrder?.['案件管理'],
    );
    return keys.map((k) => selects.find((f) => f.fieldKey === k)!);
  }, [fields, masterOrder]);
  const optionColors = (r: DealListItem) =>
    rowColorStyle(colorFields.map((f) => f.options.find((o) => o.id === r.values[f.fieldKey])));

  const rowStyle = (r: DealListItem): CSSProperties | undefined => {
    // 店サポ解約誘導の期限切れは最優先で塗る
    if (shopSupportDoneOptionId) {
      const dateVal = r.values[SHOP_SUPPORT_DATE_KEY] as string | null;
      const statusVal = r.values[SHOP_SUPPORT_STATUS_KEY] as string | null;
      if (statusVal !== shopSupportDoneOptionId) {
        const cmp = monthCompareToNow(dateVal);
        if (cmp === 'current') return { background: SHOP_SUPPORT_BG_CURRENT };
        if (cmp === 'past') return { background: SHOP_SUPPORT_BG_PAST };
      }
    }
    return optionColors(r);
  };

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
              ...options.map((o) => ({ id: o.id, label: o.label, color: o.color, textColor: o.textColor })),
              { id: MANAGE_OPTIONS, label: '＋ 選択肢を編集...' },
            ]}
            onSave={(v) => {
              if (v === MANAGE_OPTIONS) {
                openPanel(field.id);
                return;
              }
              save(r, { [key]: v || null });
            }}
            // 要望: 丸い枠(ピル)は付けず、文字と下矢印だけのシンプルな表示にする(ホバー時も枠を出さない)
            style={{ border: 'none', borderRadius: 0 }}
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
      const nameOf = (id: string | null) => (id === DEAL_USER_OTHER ? DEAL_USER_OTHER_LABEL : (userOptions?.find((u) => u.id === id)?.name ?? ''));
      return {
        key,
        label: field.label,
        width: 110,
        render: (r) => (
          <InlineSelect
            value={(r.values[key] as string | null) ?? ''}
            options={[...(userOptions ?? []).map((u) => ({ id: u.id, label: u.name })), { id: DEAL_USER_OTHER, label: DEAL_USER_OTHER_LABEL }]}
            onSave={(v) => save(r, { [key]: v || null })}
          />
        ),
        copyValue: (r) => nameOf(r.values[key] as string | null),
        pasteValue: (r, text) => {
          const t = text.trim();
          if (!t) return save(r, { [key]: null });
          const m = userOptions?.find((u) => u.name === t);
          // アカウントと一致しない名前は「その他」へまとめる(要望)
          save(r, { [key]: m ? m.id : DEAL_USER_OTHER });
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
      sort={sort?.key === col.key ? sort.dir : null}
      onSort={(dir) => setSort(dir ? { key: col.key, dir } : null)}
      label={col.label}
      options={() => optionsFor(col)}
      selected={filters[col.key] ?? null}
      onChange={(sel) => setFilters((f) => ({ ...f, [col.key]: sel }))}
      searchText={columnSearch[col.key] ?? ''}
      onSearchTextChange={(text) => setColumnSearch((s) => ({ ...s, [col.key]: text }))}
    />
  );

  // 携帯のコンパクト表示(要望): 先頭の列を見出し、最初のプルダウン列をラベル、残りの数列を2行目に出す
  const mobileCard = useMemo<MobileCardConfig<DealListItem> | undefined>(() => {
    const sorted = fields ?? [];
    if (sorted.length === 0) return undefined;
    const title = sorted[0];
    const badge = sorted.find((f) => f.dataType === 'SELECT' && f !== title);
    const meta = sorted.filter((f) => f !== title && f !== badge && f.dataType !== 'SELECT').slice(0, 4);
    return {
      title: title.fieldKey,
      badge: badge?.fieldKey,
      badgeColor: badge ? (r) => badge.options.find((o) => o.id === r.values[badge.fieldKey])?.color : undefined,
      meta: meta.map((f) => f.fieldKey),
    };
  }, [fields]);

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
  }, [fields, userOptions, filters, columnSearch, rawRows]);

  const rows = useMemo(() => {
    let filtered = rawRows;

    // 検索欄は全項目を対象に(要望: 案件名だけでなく全項目を検索できるように)
    const kw = keyword.trim().toLowerCase();
    if (kw) {
      filtered = filtered.filter((r) => columns.some((c) => (c.copyValue?.(r) ?? '').toLowerCase().includes(kw)));
    }

    // 列の絞り込み: チェックが入っている値 or 絞り込み内検索にヒットした値、のどちらかを満たせば表示
    // (要望: 絞り込み内で検索してヒットしたらそれだけを表示されるように)
    const activeFilterKeys = new Set([
      ...Object.keys(filters).filter((k) => filters[k] != null),
      ...Object.keys(columnSearch).filter((k) => columnSearch[k]),
    ]);
    if (activeFilterKeys.size > 0) {
      filtered = filtered.filter((r) =>
        Array.from(activeFilterKeys).every((key) => {
          const col = columns.find((c) => c.key === key);
          if (!col?.copyValue) return true;
          const val = col.copyValue(r);
          const searchText = columnSearch[key];
          if (searchText && val.toLowerCase().includes(searchText.toLowerCase())) return true;
          const sel = filters[key];
          return sel ? sel.has(val) : false;
        }),
      );
    }

    if (personFilter) {
      filtered = filtered.filter((r) => r.values[ASSIGNEE_FIELD_KEY] === personFilter);
    }

    // 列の昇順・降順(要望)。日付は日付順、それ以外は表示の文字で比べる(数字は数値として)。空欄は常に最後
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const isDate = fields?.find((f) => f.fieldKey === sort.key)?.dataType === 'DATE';
      const valueOf = (r: DealListItem) => (isDate ? String(r.values[sort.key] ?? '') : (col?.copyValue?.(r) ?? ''));
      const sign = sort.dir === 'asc' ? 1 : -1;
      filtered = [...filtered].sort((a, b) => {
        const va = valueOf(a);
        const vb = valueOf(b);
        if (!va || !vb) return va ? -1 : vb ? 1 : 0;
        return sign * va.localeCompare(vb, 'ja', { numeric: true });
      });
    }

    // 案件名が同じ案件は自動で纏める(要望)。最初に出てくる位置にまとめ、それ以外の並びは変えない
    const nameKey = fields?.find((f) => f.label === '案件名')?.fieldKey;
    if (nameKey) {
      const groups = new Map<string, DealListItem[]>();
      const order: DealListItem[][] = [];
      for (const r of filtered) {
        const v = r.values[nameKey];
        const name = typeof v === 'string' ? v.trim() : '';
        if (!name) {
          order.push([r]);
          continue;
        }
        const g = groups.get(name);
        if (g) g.push(r);
        else {
          const ng = [r];
          groups.set(name, ng);
          order.push(ng);
        }
      }
      filtered = order.flat();
    }
    return filtered;
  }, [rawRows, keyword, filters, columnSearch, personFilter, columns, fields, sort]);

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 className="page-title">案件管理</h1>
            <PresenceBar viewers={presence.viewers} style={{ marginBottom: 0 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => openPanel()} style={{ fontSize: 13 }}>
              列を管理
            </button>
            <button onClick={() => setBulkImportOpen(true)} style={{ fontSize: 13 }}>
              一括投入
            </button>
            <button className="btn-primary" onClick={() => setAddOpen(true)} style={{ fontSize: 13 }}>
              ＋ 案件追加
            </button>
          </div>
        </div>

        {displayedError && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{displayedError}</p>}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            placeholder="全項目を検索"
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
              <button
                onClick={() => setPersonFilter((cur) => (cur === DEAL_USER_OTHER ? null : DEAL_USER_OTHER))}
                style={{
                  fontSize: 12,
                  padding: '4px 12px',
                  border: 'none',
                  borderRadius: 999,
                  fontWeight: personFilter === DEAL_USER_OTHER ? 700 : 500,
                  background: personFilter === DEAL_USER_OTHER ? 'var(--color-primary-soft)' : 'var(--color-subtle)',
                  color: personFilter === DEAL_USER_OTHER ? 'var(--color-primary)' : 'var(--color-text-muted)',
                }}
              >
                {DEAL_USER_OTHER_LABEL}
              </button>
            </div>
          )}
        </div>

        <DataTable
          tableKey="deals"
          cellTextColor
          freezeFirstColumn
          columns={columns}
          mobileCard={mobileCard}
          rows={rows}
          total={rows.length}
          page={page}
          pageSize={pageSize}
          loading={isLoading}
          onPageChange={setPage}
          getRowId={(r) => r.id}
          rowStyle={rowStyle}
          onReorder={(ids) => reorderMutation.mutate(ids)}
          onDeleteRows={(ids) => deleteMutation.mutate(ids)}
          onDeleteColumn={(key) => {
            const id = fields?.find((f) => f.fieldKey === key)?.id;
            if (id) deleteFieldMutation.mutate(id);
          }}
          onReorderColumns={(keys) => {
            const ids = [...LEADING_FIELD_KEYS, ...keys.filter((k) => !LEADING_FIELD_KEYS.includes(k))]
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
          userOptions={userOptions ?? []}
          submitting={createMutation.isPending}
          onCancel={() => setAddOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      )}

      {bulkImportOpen && (
        <BulkImportDealsModal
          fields={fields ?? []}
          userOptions={userOptions ?? []}
          onClose={() => setBulkImportOpen(false)}
          onImported={() => {
            invalidate();
            invalidateFields();
          }}
        />
      )}
    </AppLayout>
  );
}
