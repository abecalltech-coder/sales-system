import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { InlineFlexDate, InlineNumber, InlineSelect, InlineText } from '../../components/InlineEdit';
import { useIsPhone } from '../../lib/useIsPhone';
import { useBatchedRowSave } from '../../lib/useBatchedRowSave';
import { api, ApiError } from '../../lib/api';

/** ステータスの選択肢(要望) */
const CB_STATUSES = ['MC待ち', 'MC済み', '情報回収中', '申請済み'];
/** 区分の選択肢(要望) */
const CB_CATEGORIES = ['社販', 'エネパル違約金', '既契約違約金', 'クレーム'];

interface CbCase {
  id: string;
  caseName: string;
  applicationNo: string;
  category: string | null;
  contractDate: string | null;
  mcDate: string | null;
  cbAmount: number | null;
  status: string | null;
  memo: string;
  version: number;
  createdAt: string;
}

type Patch = Partial<Pick<CbCase, 'caseName' | 'applicationNo' | 'category' | 'contractDate' | 'mcDate' | 'cbAmount' | 'status' | 'memo'>>;

/** "YYYY-MM-DD" ⇔ 一覧の日付部品(ISO)。日付だけを扱うので端末の日付で変換する */
const dateToIso = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);
const isoToDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (d: string | null) => (d ? `${Number(d.slice(0, 4))}/${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');
const fmtYen = (n: number | null) => (n == null ? '' : `${n.toLocaleString('ja-JP')}円`);

/**
 * CB管理(要望: CBの案件を登録して一覧で管理する。開いたときは一覧)。
 * 項目は案件名・申込番号・区分・成約日・MC日・CB金額・ステータス・備考(金額内訳)で、すべて任意。
 * PC は一覧のセルをその場で直せる。携帯はカードを押すと編集画面。行の削除は右クリック(長押し)メニュー。
 */
export function CbCasesPage() {
  const isPhone = useIsPhone();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['cb-cases'], queryFn: () => api.get<CbCase[]>('/cb-cases') });
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<CbCase | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return (data ?? []).filter(
      (r) =>
        (!statusFilter || (statusFilter === 'none' ? !r.status : r.status === statusFilter)) &&
        (!kw || r.caseName.toLowerCase().includes(kw) || r.applicationNo.toLowerCase().includes(kw) || r.memo.toLowerCase().includes(kw)),
    );
  }, [data, keyword, statusFilter]);
  const totalAmount = rows.reduce((a, r) => a + (r.cbAmount ?? 0), 0);

  const onErr = (e: unknown) => {
    setError(e instanceof ApiError ? e.message : '保存に失敗しました');
    queryClient.invalidateQueries({ queryKey: ['cb-cases'] });
  };
  const update = useMutation({
    mutationFn: (v: { id: string; version: number; patch: Patch }) => api.patch<CbCase>(`/cb-cases/${v.id}`, { version: v.version, ...v.patch }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['cb-cases'] });
    },
    onError: onErr,
  });
  // 同じ行への複数セルの貼り付けは1回の保存にまとめる(バージョン競合を防ぐ)
  const save = useBatchedRowSave<CbCase, Patch>(
    (r) => r.id,
    (r, patch) => update.mutate({ id: r.id, version: r.version, patch }),
  );
  const remove = useMutation({
    mutationFn: (ids: string[]) => api.post('/cb-cases/bulk-delete', { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cb-cases'] }),
    onError: onErr,
  });

  const columns: Column<CbCase>[] = [
    {
      key: 'caseName',
      label: '案件名',
      width: 220,
      render: (r) => <InlineText value={r.caseName} onSave={(v) => save(r, { caseName: v })} />,
      copyValue: (r) => r.caseName,
      pasteValue: (r, t) => save(r, { caseName: t.trim() }),
    },
    {
      key: 'applicationNo',
      label: '申込番号',
      width: 130,
      render: (r) => <InlineText value={r.applicationNo} onSave={(v) => save(r, { applicationNo: v })} />,
      copyValue: (r) => r.applicationNo,
      pasteValue: (r, t) => save(r, { applicationNo: t.trim() }),
    },
    {
      key: 'category',
      label: '区分',
      width: 120,
      render: (r) => (
        <InlineSelect value={r.category} options={CB_CATEGORIES.map((s) => ({ id: s, label: s }))} onSave={(v) => save(r, { category: v || null })} />
      ),
      copyValue: (r) => r.category ?? '',
      pasteValue: (r, t) => {
        const v = t.trim();
        if (!v) save(r, { category: null });
        else if (CB_CATEGORIES.includes(v)) save(r, { category: v });
      },
    },
    {
      key: 'contractDate',
      label: '成約日',
      width: 100,
      render: (r) => (
        <InlineFlexDate iso={dateToIso(r.contractDate)} label="成約日" onSave={(iso) => save(r, { contractDate: isoToDate(iso) })} onInvalid={setError} />
      ),
      copyValue: (r) => fmtDate(r.contractDate),
    },
    {
      key: 'mcDate',
      label: 'MC日',
      width: 100,
      render: (r) => <InlineFlexDate iso={dateToIso(r.mcDate)} label="MC日" onSave={(iso) => save(r, { mcDate: isoToDate(iso) })} onInvalid={setError} />,
      copyValue: (r) => fmtDate(r.mcDate),
    },
    {
      key: 'cbAmount',
      label: 'CB金額',
      width: 110,
      render: (r) => <InlineNumber value={r.cbAmount} onSave={(v) => save(r, { cbAmount: v == null ? null : Math.round(v) })} />,
      copyValue: (r) => (r.cbAmount == null ? '' : String(r.cbAmount)),
      pasteValue: (r, t) => {
        const raw = t.trim().replace(/[,円¥￥\s]/g, '');
        if (!raw) return save(r, { cbAmount: null });
        const n = Number(raw);
        if (Number.isFinite(n)) save(r, { cbAmount: Math.round(n) });
      },
    },
    {
      key: 'status',
      label: 'ステータス',
      width: 110,
      render: (r) => (
        <InlineSelect value={r.status} options={CB_STATUSES.map((s) => ({ id: s, label: s }))} onSave={(v) => save(r, { status: v || null })} />
      ),
      copyValue: (r) => r.status ?? '',
      pasteValue: (r, t) => {
        const v = t.trim();
        if (!v) save(r, { status: null });
        else if (CB_STATUSES.includes(v)) save(r, { status: v });
      },
    },
    {
      key: 'memo',
      label: '備考(金額内訳)',
      width: 320,
      render: (r) => <InlineText value={r.memo} expand onSave={(v) => save(r, { memo: v })} />,
      copyValue: (r) => r.memo,
      pasteValue: (r, t) => save(r, { memo: t }),
    },
  ];

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header" style={{ gap: 8, flexWrap: 'wrap' }}>
          <h1 className="page-title" style={{ flex: 1 }}>
            CB管理
          </h1>
          <button className="btn-primary" onClick={() => setEditing('new')}>
            ＋ 案件登録
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <input placeholder="案件名・申込番号・備考で検索" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: isPhone ? '100%' : 220 }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">ステータス: すべて</option>
            {CB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="none">未設定</option>
          </select>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {rows.length}件 / CB金額 合計 <b style={{ color: 'var(--color-text)' }}>{totalAmount.toLocaleString('ja-JP')}円</b>
          </span>
        </div>
        {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: '0 0 8px' }}>{error}</p>}

        <DataTable
          tableKey="cb-cases"
          columns={columns}
          rows={rows}
          total={rows.length}
          page={1}
          pageSize={20000}
          loading={isLoading}
          onPageChange={() => undefined}
          getRowId={(r) => r.id}
          onRowClick={isPhone ? (r) => setEditing(r) : undefined}
          onDeleteRows={(ids) => {
            if (window.confirm(`選択した ${ids.length} 件を削除しますか？`)) remove.mutate(ids);
          }}
          mobileCard={{ title: 'caseName', badge: 'status', meta: ['applicationNo', 'category', 'contractDate', 'mcDate', 'cbAmount'] }}
        />
        {!isLoading && (data ?? []).length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 8 }}>まだ案件がありません。「＋ 案件登録」から登録してください</p>
        )}
      </div>

      {editing && (
        <CbEditor
          item={editing === 'new' ? null : editing}
          isPhone={isPhone}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['cb-cases'] });
            setEditing(null);
          }}
          onDelete={(id) => {
            if (!window.confirm('この案件を削除しますか？')) return;
            remove.mutate([id], { onSuccess: () => setEditing(null) });
          }}
        />
      )}
    </AppLayout>
  );
}

/** 案件の登録・編集(すべて任意) */
function CbEditor({
  item,
  isPhone,
  onClose,
  onSaved,
  onDelete,
}: {
  item: CbCase | null;
  isPhone: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({
    caseName: item?.caseName ?? '',
    applicationNo: item?.applicationNo ?? '',
    category: item?.category ?? '',
    contractDate: item?.contractDate ?? '',
    mcDate: item?.mcDate ?? '',
    cbAmount: item?.cbAmount == null ? '' : String(item.cbAmount),
    status: item?.status ?? '',
    memo: item?.memo ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () => {
      const amount = form.cbAmount.replace(/[,円¥￥\s]/g, '');
      const body = {
        caseName: form.caseName,
        applicationNo: form.applicationNo,
        category: form.category || null,
        contractDate: form.contractDate || null,
        mcDate: form.mcDate || null,
        cbAmount: amount === '' ? null : Math.round(Number(amount)),
        status: form.status || null,
        memo: form.memo,
      };
      if (body.cbAmount != null && !Number.isFinite(body.cbAmount)) throw new Error('CB金額は数字で入力してください');
      return item ? api.patch(`/cb-cases/${item.id}`, { version: item.version, ...body }) : api.post('/cb-cases', body);
    },
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : '保存に失敗しました'),
  });

  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: isPhone ? '10px 12px' : '6px 9px', fontSize: isPhone ? 14 : 13, borderRadius: 8 };
  const label = (t: string) => <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', margin: isPhone ? '14px 0 6px' : '10px 0 4px' }}>{t}</div>;

  return (
    // 背景を押しても閉じない(要望: 作成途中で消えないように、閉じるのは「閉じる」か保存だけ)
    <div className="modal-backdrop" style={isPhone ? { alignItems: 'flex-end', padding: 0 } : undefined}>
      <div
        className="modal"
        style={{
          width: isPhone ? '100%' : 'min(520px, 96vw)',
          maxWidth: isPhone ? 'none' : 520,
          padding: isPhone ? '18px 18px calc(22px + env(safe-area-inset-bottom))' : '18px 20px',
          borderRadius: isPhone ? '18px 18px 0 0' : undefined,
          maxHeight: isPhone ? '92vh' : 'calc(100vh - 48px)',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--color-border)' }}>
          <b style={{ flex: 1, fontSize: 15 }}>{item ? '案件を編集' : '案件登録'}</b>
          <button onClick={onClose}>閉じる</button>
        </div>
        {label('案件名')}
        <input value={form.caseName} onChange={(e) => set({ caseName: e.target.value })} style={input} />
        {label('申込番号')}
        <input value={form.applicationNo} onChange={(e) => set({ applicationNo: e.target.value })} style={input} />
        {label('区分')}
        <select value={form.category} onChange={(e) => set({ category: e.target.value })} style={input}>
          <option value="">選択してください</option>
          {CB_CATEGORIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {label('成約日')}
            <input type="date" className="date-input" value={form.contractDate} onChange={(e) => set({ contractDate: e.target.value })} style={input} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {label('MC日')}
            <input type="date" className="date-input" value={form.mcDate} onChange={(e) => set({ mcDate: e.target.value })} style={input} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {label('CB金額(円)')}
            <input inputMode="numeric" value={form.cbAmount} onChange={(e) => set({ cbAmount: e.target.value })} placeholder="例: 30000" style={input} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {label('ステータス')}
            <select value={form.status} onChange={(e) => set({ status: e.target.value })} style={input}>
              <option value="">選択してください</option>
              {CB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        {label('備考(金額内訳)')}
        <textarea value={form.memo} onChange={(e) => set({ memo: e.target.value })} rows={6} style={{ ...input, lineHeight: 1.6 }} />
        {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: '8px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {item && (
            <button onClick={() => onDelete(item.id)} style={{ color: 'var(--color-danger)', padding: isPhone ? '10px 16px' : undefined }}>
              削除
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()} style={{ padding: isPhone ? '10px 28px' : '6px 20px' }}>
            {save.isPending ? '保存中...' : item ? '保存' : '登録'}
          </button>
        </div>
      </div>
    </div>
  );
}
