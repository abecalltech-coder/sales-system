import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'ダッシュボード' },
  { to: '/toss-cases', label: 'トス実績管理' },
  { to: '/appointments', label: 'アポ実績管理' },
  { to: '/visits', label: '訪問管理' },
  { to: '/contracts', label: '成約管理' },
  { to: '/entries', label: 'エントリー管理' },
  { to: '/summary', label: 'サマリー' },
  { to: '/customers', label: '顧客管理' },
  { to: '/admin/users', label: 'ユーザー管理' },
  { to: '/admin/organizations', label: '組織管理' },
  { to: '/admin/masters', label: 'マスタ管理' },
  { to: '/admin/custom-fields', label: 'カスタム項目管理' },
];

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <nav style={{ width: 200, borderRight: '1px solid #e5e7eb', padding: '16px 0', flexShrink: 0 }}>
        <div style={{ padding: '0 16px', fontWeight: 700, marginBottom: 16, fontSize: 14 }}>営業案件管理</div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'block',
              padding: '8px 16px',
              fontSize: 14,
              textDecoration: 'none',
              color: isActive ? '#111827' : '#4b5563',
              background: isActive ? '#f3f4f6' : 'transparent',
              fontWeight: isActive ? 600 : 400,
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
