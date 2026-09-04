import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/login', { email, password });
      navigate('/toss-cases');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background:
          'radial-gradient(1100px 520px at 15% -10%, #e7ecfb 0%, transparent 60%), radial-gradient(900px 480px at 100% 110%, #e9edf6 0%, transparent 55%), var(--color-bg)',
      }}
    >
      <div style={{ width: 340 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: 'linear-gradient(150deg, #4762e0 0%, #2c44b4 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '-0.02em',
              boxShadow: '0 4px 12px rgba(44, 68, 180, 0.35)',
            }}
          >
            CH
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.015em' }}>CH partners実績管理</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>Sales Pipeline Management</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, boxShadow: 'var(--shadow-md)' }}>
          <h1 style={{ fontSize: 15, marginBottom: 16 }}>ログイン</h1>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', marginBottom: 4 }}>メールアドレス</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              style={{ display: 'block', width: '100%' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ display: 'block', marginBottom: 4 }}>パスワード</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{ display: 'block', width: '100%' }}
            />
          </label>

          {error && (
            <div
              style={{
                background: 'var(--color-danger-soft)',
                color: 'var(--color-danger)',
                fontSize: 12,
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', padding: 8 }}>
            {loading ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
