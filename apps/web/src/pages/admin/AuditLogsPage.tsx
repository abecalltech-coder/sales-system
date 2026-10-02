import { useState } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { useAuditLogs, AuditLogItem, AuditLogChange } from '../../hooks/useApi';
import { ALL_NAV_TABS } from '../../lib/navTabs';

/** 画面パスが取れない操作(旧ログ・外部連携など)は、APIのリソース名からタブを推定する */
const RESOURCE_TABS: Record<string, string> = {
  'toss-cases': 'トス実績管理',
  appointments: 'アポ実績管理',
  contracts: 'エントリー管理',
  deals: '案件管理',
  'monthly-summary': 'サマリー',
  'summary-sheets': 'サマリー',
  'custom-reports': 'サマリー',
  'monthly-shift': 'シフト',
  'final-reports': '最終報告',
  users: 'ユーザー管理',
  roles: 'ユーザー管理',
  organizations: '組織管理',
  'status-master': 'マスタ管理',
  'automation-rules': 'マスタ管理',
  'toss-form': 'トスフォーム設定',
  'custom-fields': 'カスタム項目管理',
  integrations: '連携設定',
  'system-settings': 'システム設定',
  'appointment-reports': 'CLカレンダー',
  visits: '訪問',
  comments: 'コメント',
  'cell-styles': '一覧',
  'offline-actions': 'モバイル',
};

/** 構造化される前から残っている操作種別 */
const LEGACY_ACTIONS: Record<string, string> = {
  LOGIN_SUCCESS: 'ログイン',
  LOGIN_FAILED: 'ログイン失敗',
  LOGOUT: 'ログアウト',
  'toss_case.period_move': '当月へ移動',
  'appointment.period_move': '当月へ移動',
  'contract.period_move': '当月へ移動',
};
const LEGACY_TABS: Record<string, string> = {
  TOSS_CASE: 'トス実績管理',
  APPOINTMENT: 'アポ実績管理',
  CONTRACT: 'エントリー管理',
};

interface Structured {
  page?: string | null;
  op?: string;
  target?: string | null;
  changes?: AuditLogChange[];
  count?: number;
}

function structured(r: AuditLogItem): Structured | null {
  const a = r.after as Structured | null;
  return a && typeof a === 'object' && typeof a.op === 'string' ? a : null;
}

function tabOf(r: AuditLogItem): string {
  const s = structured(r);
  const page = s?.page ?? null;
  if (page) {
    const hit = ALL_NAV_TABS.filter((t) => page === t.key || page.startsWith(`${t.key}/`)).sort((a, b) => b.key.length - a.key.length)[0];
    if (hit) return hit.label;
  }
  if (r.action.startsWith('LOGIN') || r.action === 'LOGOUT') return 'ログイン';
  return RESOURCE_TABS[r.targetType ?? ''] ?? LEGACY_TABS[r.targetType ?? ''] ?? page ?? '';
}

function opOf(r: AuditLogItem): string {
  const s = structured(r);
  if (s?.op) return s.count != null && s.count > 1 ? `${s.op}(${s.count}件)` : s.op;
  return LEGACY_ACTIONS[r.action] ?? r.action;
}

function targetOf(r: AuditLogItem): string {
  return structured(r)?.target ?? '';
}

function changeText(c: AuditLogChange): string {
  return c.before !== undefined ? `${c.label}: ${c.before} → ${c.after}` : `${c.label}: ${c.after}`;
}

function changesOf(r: AuditLogItem): AuditLogChange[] {
  const s = structured(r);
  if (s?.changes) return s.changes;
  // 旧形式(当月へ移動)
  const after = r.after as { periodMonth?: string } | null;
  if (after && typeof after.periodMonth === 'string') return [{ label: '対象月', after: after.periodMonth }];
  return [];
}

function ChangeDetail({ row }: { row: AuditLogItem }) {
  const list = changesOf(row);
  const target = targetOf(row);
  return (
    <div style={{ padding: '6px 12px 8px 28px', fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ color: 'var(--color-text-muted)', marginBottom: 2 }}>
        {tabOf(row)} / {opOf(row)}
        {target && ` / ${target}`}
      </div>
      {list.length === 0 ? (
        <div style={{ color: 'var(--color-text-faint)' }}>変更項目の記録はありません</div>
      ) : (
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {list.map((c, i) => (
              <tr key={i}>
                <td style={{ padding: '1px 12px 1px 0', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{c.label}</td>
                <td style={{ padding: '1px 8px 1px 0', whiteSpace: 'pre-wrap', verticalAlign: 'top', color: 'var(--color-text-faint)' }}>
                  {c.before !== undefined ? c.before : ''}
                </td>
                <td style={{ padding: '1px 8px 1px 0', verticalAlign: 'top' }}>{c.before !== undefined ? '→' : ''}</td>
                <td style={{ padding: '1px 0', whiteSpace: 'pre-wrap', verticalAlign: 'top', fontWeight: 600 }}>{c.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 2000; // 1画面でまとめて表示(要望)。ログは増え続けるため最新2000件ずつ
  const { data, isLoading } = useAuditLogs({ page, pageSize });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const columns: Column<AuditLogItem>[] = [
    {
      key: 'createdAt',
      label: '日時',
      render: (r) => new Date(r.createdAt).toLocaleString('ja-JP'),
      copyValue: (r) => new Date(r.createdAt).toLocaleString('ja-JP'),
      width: 140,
    },
    {
      key: 'actor',
      label: '操作者',
      render: (r) => r.actor?.name ?? 'システム',
      copyValue: (r) => r.actor?.name ?? 'システム',
      width: 100,
    },
    { key: 'tab', label: 'タブ', render: tabOf, copyValue: tabOf, width: 110 },
    { key: 'action', label: '操作種別', render: opOf, copyValue: opOf, width: 130 },
    {
      key: 'target',
      label: '対象',
      render: (r) => <span title={targetOf(r)}>{targetOf(r)}</span>,
      copyValue: targetOf,
      width: 200,
    },
    {
      key: 'changes',
      label: '変更・入力内容',
      width: 460,
      // 一覧は行の高さが固定(仮想スクロール)なので1行に要約し、行クリックで全項目を展開する
      render: (r) => {
        const text = changesOf(r).map(changeText).join(' / ');
        return <span title={text}>{text}</span>;
      },
      copyValue: (r) => changesOf(r).map(changeText).join(' / '),
    },
    {
      key: 'success',
      label: '結果',
      render: (r) => (r.success ? '成功' : <span style={{ color: 'var(--color-danger)' }}>失敗: {r.errorMessage ?? ''}</span>),
      copyValue: (r) => (r.success ? '成功' : `失敗: ${r.errorMessage ?? ''}`),
      width: 140,
    },
  ];

  return (
    <AppLayout>
      <div className="page">
        <h1 className="page-title" style={{ marginBottom: 4 }}>操作ログ</h1>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          行をクリックすると変更・入力内容を全項目表示します。
        </p>
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
          expandedRowId={expandedId}
          renderExpanded={(r) => <ChangeDetail row={r} />}
        />
      </div>
    </AppLayout>
  );
}
