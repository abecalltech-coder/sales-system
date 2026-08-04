import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface Me {
  name: string;
  email: string;
  roles: string[];
}

export function DashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then(setMe)
      .catch(() => navigate('/login'));
  }, [navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h1>ダッシュボード</h1>
      {me ? (
        <p>
          ようこそ、{me.name}さん(ロール: {me.roles.join(', ')})
        </p>
      ) : (
        <p>読み込み中...</p>
      )}
      <p style={{ color: '#666' }}>
        トス/アポ/訪問/成約/エントリー管理、サマリー等はPhase3以降で実装します。
      </p>
    </div>
  );
}
