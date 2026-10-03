import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMyProfile } from '../hooks/useChat';
import { usePushNotifications } from '../lib/usePushNotifications';
import { resizeImage } from '../lib/image';
import { api, ApiError } from '../lib/api';
import { Avatar } from './Avatar';

/**
 * 画面上部のバー(要望): 右端に自分のアカウントの四角いアイコン。押すと写真・通知オン/オフの設定が開く。
 * 「別ウィンドウ」ボタンで今のタブを別のブラウザウィンドウとして独立して開ける。
 */
export function AccountBar() {
  const { data: profile } = useMyProfile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const popOut = () => {
    // 今開いているタブを、独立したウィンドウ(アドレスバー等の少ない別ウィンドウ)で開く
    window.open(window.location.href, `tab-${Date.now()}`, 'popup,width=1280,height=860');
  };

  return (
    <div
      className="account-bar"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 6,
        height: 36,
        padding: '0 10px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <button
        type="button"
        onClick={popOut}
        title="このタブを別ウィンドウで開く"
        aria-label="このタブを別ウィンドウで開く"
        style={{ height: 26, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, border: 'none', background: 'transparent', boxShadow: 'none', color: 'var(--color-text-muted)' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
        </svg>
        別ウィンドウ
      </button>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="アカウント設定"
          title="アカウント設定(写真・通知)"
          style={{ padding: 0, border: 'none', background: 'transparent', boxShadow: 'none', display: 'flex' }}
        >
          <Avatar src={profile?.iconUrl} name={profile?.name ?? ''} seed={profile?.id} size={28} square />
        </button>
        {open && <AccountSettings onClose={() => setOpen(false)} />}
      </div>
    </div>
  );
}

function AccountSettings({ onClose }: { onClose: () => void }) {
  const { data: profile } = useMyProfile();
  const queryClient = useQueryClient();
  const push = usePushNotifications();
  const pushOn = push.permission === 'granted' && push.subscribed;
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveIcon = useMutation({
    mutationFn: (iconUrl: string | null) => api.put('/me/profile', { iconUrl }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['me', 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['user-options'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '写真を保存できませんでした'),
  });

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      saveIcon.mutate(await resizeImage(file, 192, { square: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '画像を読み込めませんでした');
    }
  };

  const sendTest = async () => {
    setTestMsg(null);
    try {
      const res = await api.post<{ ok: boolean; reason?: string }>('/push/test');
      setTestMsg(res.ok ? '送信しました' : (res.reason ?? '送信できませんでした'));
    } catch {
      setTestMsg('送信に失敗しました');
    }
  };

  return (
    <div className="popover" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 'min(280px, calc(100vw - 16px))', padding: 12, zIndex: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Avatar src={profile?.iconUrl} name={profile?.name ?? ''} seed={profile?.id} size={52} square />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>{profile?.name}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={saveIcon.isPending} style={{ fontSize: 11, padding: '2px 8px' }}>
              {saveIcon.isPending ? '保存中...' : '写真を変更'}
            </button>
            {profile?.iconUrl && (
              <button type="button" onClick={() => saveIcon.mutate(null)} style={{ fontSize: 11, padding: '2px 8px' }}>
                外す
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
      </div>
      {error && <p style={{ fontSize: 11, color: 'var(--color-danger)', margin: '0 0 8px' }}>{error}</p>}

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12 }}>この端末の通知</span>
          {push.permission === 'unsupported' ? (
            <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>非対応</span>
          ) : (
            <button
              type="button"
              disabled={push.busy}
              onClick={() => (pushOn ? push.disable() : push.enable())}
              style={{
                fontSize: 11,
                padding: '3px 12px',
                background: pushOn ? 'var(--color-primary)' : 'var(--color-surface)',
                color: pushOn ? '#fff' : 'var(--color-text)',
              }}
            >
              {push.busy ? '設定中...' : pushOn ? 'ON' : 'OFF'}
            </button>
          )}
        </div>
        <p style={{ fontSize: 10, color: 'var(--color-text-faint)', margin: '4px 0 0' }}>商談リマインド・実施報告・チャットの新着をこの端末に通知します</p>
        {push.error && <p style={{ fontSize: 11, color: 'var(--color-danger)', margin: '4px 0 0' }}>{push.error}</p>}
        {pushOn && (
          <div style={{ marginTop: 6 }}>
            <button type="button" onClick={sendTest} style={{ fontSize: 10, padding: '2px 6px' }}>
              テスト通知を送る
            </button>
            {testMsg && <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 6 }}>{testMsg}</span>}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', marginTop: 10 }}>
        <button type="button" onClick={onClose} style={{ fontSize: 11, padding: '2px 10px' }}>
          閉じる
        </button>
      </div>
    </div>
  );
}
