import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/register', { email, password, name, employeeCode: employeeCode || undefined });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 360, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, marginBottom: 16 }}>登録を受け付けました</h1>
          <p style={{ fontSize: 14, color: '#4b5563', marginBottom: 20 }}>
            管理者の承認が完了するとログインできるようになります。しばらくお待ちください。
          </p>
          <Link to="/login">ログイン画面へ戻る</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} style={{ width: 320 }}>
        <h1 style={{ fontSize: 18, marginBottom: 24 }}>新規登録</h1>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          登録後、管理者の承認が完了するまでログインできません。
        </p>
        <label>
          氏名
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ display: 'block', width: '100%', marginBottom: 12 }}
          />
        </label>
        <label>
          社員コード(任意)
          <input
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: 12 }}
          />
        </label>
        <label>
          メールアドレス
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: 'block', width: '100%', marginBottom: 12 }}
          />
        </label>
        <label>
          パスワード(8文字以上/大小英字・数字を含む)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ display: 'block', width: '100%', marginBottom: 12 }}
          />
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ width: '100%', padding: 8, marginBottom: 12 }}>
          {loading ? '登録中...' : '登録する'}
        </button>
        <div style={{ textAlign: 'center', fontSize: 13 }}>
          <Link to="/login">ログイン画面へ戻る</Link>
        </div>
      </form>
    </div>
  );
}
