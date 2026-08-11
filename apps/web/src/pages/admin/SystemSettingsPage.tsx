import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useSystemSettings } from '../../hooks/useApi';
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
      <div style={{ padding: 24, maxWidth: 480 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>システム設定</h1>

        <ChangeMyPasswordSection />

        {message && <p style={{ color: '#16a34a', fontSize: 13 }}>{message}</p>}

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
    </AppLayout>
  );
}
