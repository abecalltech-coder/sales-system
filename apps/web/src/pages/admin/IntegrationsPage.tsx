import { AppLayout } from '../../components/AppLayout';

export function IntegrationsPage() {
  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 480 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>連携設定</h1>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Googleフォーム連携</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>未設定</div>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
            Googleフォームの回答IDやWebhook Secretなどの設定は、Google Cloud側の準備が整い次第このシステムで対応します。
          </p>
        </div>

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
