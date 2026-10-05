import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DealFieldItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

export interface SheetSyncResult {
  at: string;
  by: string;
  created: number;
  updated: number;
  protectedFields: number;
  duplicates: number;
  skippedUsers: string[];
}

interface SheetSyncConfig {
  url: string;
  mapping: Record<string, string>;
  lastResult: SheetSyncResult | null;
}

// 列名が同じ項目へ自動で対応づける(一括投入と同じ対応表も使う)
const KNOWN: Record<string, string> = {
  訪問日: '商談日',
  CL: '担当者名',
  店舗名: '案件名',
  ET日: 'エントリー日',
  進捗: 'ステータス',
  MCOK日: 'MC日',
};

export function useSheetSync() {
  return useQuery({ queryKey: ['deal-sheet-sync'], queryFn: () => api.get<SheetSyncConfig>('/deal-sheet-sync') });
}

/** 結果の1行表示 */
export function sheetResultText(r: SheetSyncResult): string {
  const parts = [`追加${r.created}件`, `既存へ記載${r.updated}件`];
  if (r.protectedFields) parts.push(`手打ちのため上書きしなかった項目${r.protectedFields}`);
  if (r.duplicates) parts.push(`重複${r.duplicates}件`);
  return parts.join(' / ');
}

/**
 * シート連携の設定(要望: 「CSV貼り付け用」シートから案件管理へ反映)。
 * シートのURLを入れて見出しを読み込み、各列をどの項目へ入れるかを選ぶ。
 */
export function SheetSyncModal({ fields, onClose }: { fields: DealFieldItem[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: cfg } = useSheetSync();
  const [url, setUrl] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlValue = url ?? cfg?.url ?? '';
  const mappingValue = mapping ?? cfg?.mapping ?? {};
  const shownHeaders = headers ?? Object.keys(cfg?.mapping ?? {});

  const load = useMutation({
    mutationFn: () => api.post<{ headers: string[]; rows: number }>('/deal-sheet-sync/headers', { url: urlValue }),
    onSuccess: (res) => {
      setError(null);
      setHeaders(res.headers);
      setRowCount(res.rows);
      // まだ対応づけていない列は、同じ名前(または一括投入と同じ対応)の項目を自動で選ぶ
      const next = { ...mappingValue };
      for (const h of res.headers) {
        if (next[h] !== undefined) continue;
        const label = KNOWN[h] ?? h;
        const f = fields.find((x) => x.label === label);
        if (f) next[h] = f.fieldKey;
      }
      setMapping(next);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'シートを読めませんでした'),
  });

  const save = useMutation({
    mutationFn: () => api.put('/deal-sheet-sync', { url: urlValue, mapping: Object.fromEntries(Object.entries(mappingValue).filter(([h, k]) => k && shownHeaders.includes(h))) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal-sheet-sync'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : '保存できませんでした'),
  });

  const mappedCount = shownHeaders.filter((h) => mappingValue[h]).length;
  const hasName = shownHeaders.some((h) => fields.find((f) => f.fieldKey === mappingValue[h])?.label === '案件名');

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 600, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head">
          <div className="modal-title">シート連携の設定</div>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.6 }}>
            Googleスプレッドシートの取り込むシート(タブ)を開いた状態のURLを貼り付けてください。「シートから更新」を押すたびに最新の内容を読み、一括投入と同じ決まりで反映します(手打ち・システム内で入れた値は上書きしません)。
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={urlValue} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=..." style={{ flex: 1, minWidth: 0, fontSize: 12 }} />
            <button type="button" disabled={!urlValue.trim() || load.isPending} onClick={() => load.mutate()} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {load.isPending ? '読み込み中...' : '見出しを読み込む'}
            </button>
          </div>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: 0 }}>{error}</p>}
          {headers && <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: 0 }}>シートの列 {headers.length}個 / データ {rowCount}行</p>}

          {shownHeaders.length > 0 && (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '6px 10px', fontSize: 11, color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
                <span>シートの列</span>
                <span>入れる項目(案件管理)</span>
              </div>
              {shownHeaders.map((h) => (
                <div key={h} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'center', padding: '4px 10px', borderBottom: '1px solid var(--color-sunken)' }}>
                  <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h}>
                    {h}
                  </span>
                  <select value={mappingValue[h] ?? ''} onChange={(e) => setMapping({ ...mappingValue, [h]: e.target.value })} style={{ fontSize: 12, height: 28, color: mappingValue[h] ? undefined : 'var(--color-text-faint)' }}>
                    <option value="">取り込まない</option>
                    {fields.map((f) => (
                      <option key={f.fieldKey} value={f.fieldKey}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          {shownHeaders.length > 0 && !hasName && (
            <p style={{ fontSize: 11.5, color: 'var(--color-warning)', margin: 0 }}>「案件名」に入れる列を選ぶと、案件名+申込番号で既存の案件へ記載できます。</p>
          )}
        </div>
        <div className="modal-foot">
          <button onClick={onClose} disabled={save.isPending}>
            キャンセル
          </button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending || !urlValue.trim() || mappedCount === 0}>
            {save.isPending ? '保存中...' : `保存(${mappedCount}列を取り込む)`}
          </button>
        </div>
      </div>
    </div>
  );
}
