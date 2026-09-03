import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useSystemSettings } from '../../hooks/useApi';
import { api } from '../../lib/api';

const LABELS: Record<string, string> = {
  arrivalWarningDistanceMeters: '訪問到着の距離警告しきい値(メートル)',
  visitLateThresholdMinutes: '遅刻扱いとする経過時間(分)',
  visitReminderMinutesBefore: '訪問前通知のタイミング(分前)',
  requireDelayReason: '遅延理由の入力を必須にする',
  duplicateCustomerRule: '顧客重複時の既定挙動',
};

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
      <div className="page" style={{ maxWidth: 480 }}>
        <h1 className="page-title" style={{ marginBottom: 10 }}>システム設定</h1>

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
