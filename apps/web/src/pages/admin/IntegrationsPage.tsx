import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useGoogleFormConfig, useGoogleFormLogs } from '../../hooks/useApi';
import { api } from '../../lib/api';

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
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 }}>
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
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 }}>
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

export function IntegrationsPage() {
  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 680 }}>
        <h1 className="page-title" style={{ marginBottom: 10 }}>連携設定</h1>

        <GoogleFormIntegrationSection />

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Googleカレンダー・Meet連携</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>未設定</div>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
            Google Cloud ConsoleでのOAuthクライアント作成後、こちらから接続できるようになります。
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
