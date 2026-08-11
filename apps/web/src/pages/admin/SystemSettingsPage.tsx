import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useSystemSettings, useGoogleFormConfig, useGoogleFormLogs } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

const LABELS: Record<string, string> = {
  arrivalWarningDistanceMeters: '訪問到着の距離警告しきい値(メートル)',
  visitLateThresholdMinutes: '遅刻扱いとする経過時間(分)',
  visitReminderMinutesBefore: '訪問前通知のタイミング(分前)',
  requireDelayReason: '遅延理由の入力を必須にする',
  duplicateCustomerRule: '顧客重複時の既定挙動',
};

function ChangeMyPasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      setError(null);
      setMessage('パスワードを変更しました');
      setCurrentPassword('');
      setNewPassword('');
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : 'パスワードの変更に失敗しました');
    },
  });

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>パスワード変更</h2>
      {message && <p style={{ color: '#16a34a', fontSize: 13, marginBottom: 8 }}>{message}</p>}
      {error && <p style={{ color: 'crimson', fontSize: 13, marginBottom: 8 }}>{error}</p>}

      <label style={{ fontSize: 13, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>現在のパスワード</label>
      <input
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        style={{ display: 'block', width: '100%', padding: 6, marginBottom: 10 }}
      />

      <label style={{ fontSize: 13, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>
        新しいパスワード(8文字以上/大小英字・数字を含む)
      </label>
      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        style={{ display: 'block', width: '100%', padding: 6, marginBottom: 10 }}
      />

      <button onClick={() => mutation.mutate()} disabled={!currentPassword || !newPassword || mutation.isPending}>
        変更する
      </button>
    </div>
  );
}

function GoogleFormIntegrationSection() {
  const { data: config, isLoading } = useGoogleFormConfig();
  const { data: logs } = useGoogleFormLogs();
  const queryClient = useQueryClient();
  const [formUrlDraft, setFormUrlDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const saveUrlMutation = useMutation({
    mutationFn: (formUrl: string) => api.put('/integrations/google-forms/config', { formUrl }),
    onSuccess: () => {
      setMessage('フォームURLを保存しました');
      setFormUrlDraft(null);
      queryClient.invalidateQueries({ queryKey: ['google-form-config'] });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => api.post('/integrations/google-forms/regenerate-secret', {}),
    onSuccess: () => {
      setMessage('シークレットを再生成しました。Apps Script側の値も更新してください');
      queryClient.invalidateQueries({ queryKey: ['google-form-config'] });
    },
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  if (isLoading || !config) {
    return (
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>Googleフォーム連携</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>
      </div>
    );
  }

  const webhookUrl = `${window.location.origin}/api/integrations/google-forms/webhook`;
  const appsScript = `function onFormSubmit(e) {
  var WEBHOOK_URL = '${webhookUrl}';
  var WEBHOOK_SECRET = '${config.webhookSecret}';

  var answers = {};
  e.response.getItemResponses().forEach(function (item) {
    answers[item.getItem().getTitle()] = item.getResponse();
  });

  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    payload: JSON.stringify({
      responseId: e.response.getId(),
      submittedAt: new Date().toISOString(),
      answers: answers,
    }),
    muteHttpExceptions: true,
  });
}`;

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Googleフォーム連携</h2>
      <p style={{ fontSize: 12, color: 'var(--color-text-faint)', marginBottom: 12 }}>
        フォームの回答はトス実績として自動登録されます。質問タイトルを下記の項目名と揃えておくと、対応する項目に自動反映されます。
      </p>
      {message && <p style={{ color: '#16a34a', fontSize: 13, marginBottom: 10 }}>{message}</p>}

      <label style={{ fontSize: 13, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>フォームURL(参照用・都度変更可)</label>
      <input
        value={formUrlDraft ?? config.formUrl}
        onChange={(e) => setFormUrlDraft(e.target.value)}
        onBlur={() => {
          if (formUrlDraft !== null && formUrlDraft !== config.formUrl) saveUrlMutation.mutate(formUrlDraft);
        }}
        placeholder="https://docs.google.com/forms/d/..."
        style={{ display: 'block', width: '100%', padding: 6, marginBottom: 14 }}
      />

      <label style={{ fontSize: 13, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>Webhook URL</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <input readOnly value={webhookUrl} style={{ flex: 1, padding: 6, background: 'var(--color-surface-muted, #f9fafb)' }} />
        <button onClick={() => copy(webhookUrl, 'url')}>{copied === 'url' ? 'コピーしました' : 'コピー'}</button>
      </div>

      <label style={{ fontSize: 13, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>Webhookシークレット</label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <input
          readOnly
          type={showSecret ? 'text' : 'password'}
          value={config.webhookSecret}
          style={{ flex: 1, padding: 6, background: 'var(--color-surface-muted, #f9fafb)' }}
        />
        <button onClick={() => setShowSecret((v) => !v)}>{showSecret ? '隠す' : '表示'}</button>
        <button onClick={() => copy(config.webhookSecret, 'secret')}>{copied === 'secret' ? 'コピーしました' : 'コピー'}</button>
        <button
          onClick={() => {
            if (confirm('シークレットを再生成すると、Apps Script側に貼り付け済みの値は使えなくなります。よろしいですか？')) {
              regenerateMutation.mutate();
            }
          }}
        >
          再生成
        </button>
      </div>

      <label style={{ fontSize: 13, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>
        Apps Scriptコード(フォームの「拡張機能 → Apps Script」に貼り付け、「トリガー」から「フォーム送信時」で本関数を登録してください)
      </label>
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 6, fontSize: 11, overflowX: 'auto', maxHeight: 240, margin: 0 }}>
          {appsScript}
        </pre>
        <button onClick={() => copy(appsScript, 'script')} style={{ position: 'absolute', top: 8, right: 8 }}>
          {copied === 'script' ? 'コピーしました' : 'コピー'}
        </button>
      </div>

      <label style={{ fontSize: 13, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>
        自動反映される質問タイトル(フォームの質問文をこれと同じ名称にしてください)
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: logs?.length ? 14 : 0 }}>
        {config.fieldNames.map((name) => (
          <span
            key={name}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'var(--color-surface-muted, #f1f5f9)',
              border: '1px solid var(--color-border)',
            }}
          >
            {name}
          </span>
        ))}
      </div>

      {logs && logs.length > 0 && (
        <div>
          <label style={{ fontSize: 13, color: 'var(--color-text-faint)', display: 'block', marginBottom: 6 }}>
            受信履歴(直近{logs.length}件)
          </label>
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 6 }}>
            {logs.map((log) => (
              <div key={log.id} style={{ display: 'flex', gap: 8, padding: '6px 10px', fontSize: 11, borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-faint)', flexShrink: 0 }}>{new Date(log.createdAt).toLocaleString('ja-JP')}</span>
                <span
                  style={{
                    fontWeight: 600,
                    flexShrink: 0,
                    color: log.status === 'PROCESSED' ? '#16a34a' : log.status === 'ERROR' ? 'crimson' : 'inherit',
                  }}
                >
                  {log.status}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.errorMessage ?? ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SystemSettingsPage() {
  const { data: settings, isLoading } = useSystemSettings();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (vars: { key: string; value: unknown }) => api.put(`/system-settings/${vars.key}`, { value: vars.value }),
    onSuccess: () => {
      setMessage('保存しました');
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div style={{ padding: 24 }}>読み込み中...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 680 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>システム設定</h1>

        <div style={{ maxWidth: 480 }}>
          <ChangeMyPasswordSection />
        </div>
        <GoogleFormIntegrationSection />

        {message && <p style={{ color: '#16a34a', fontSize: 13 }}>{message}</p>}

        <div style={{ maxWidth: 480 }}>
        {settings?.map((s) => (
          <div key={s.key} style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#6b7280' }}>{LABELS[s.key] ?? s.key}</label>
            {typeof s.value === 'boolean' ? (
              <input
                type="checkbox"
                defaultChecked={s.value}
                onChange={(e) => updateMutation.mutate({ key: s.key, value: e.target.checked })}
              />
            ) : (
              <input
                defaultValue={String(s.value)}
                onBlur={(e) => {
                  const num = Number(e.target.value);
                  updateMutation.mutate({ key: s.key, value: Number.isNaN(num) ? e.target.value : num });
                }}
                style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
              />
            )}
          </div>
        ))}
        </div>
      </div>
    </AppLayout>
  );
}
