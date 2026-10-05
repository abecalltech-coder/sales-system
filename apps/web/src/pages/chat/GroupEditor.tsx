import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '../../components/Avatar';
import { useDepartments, useMe, useUserOptions } from '../../hooks/useApi';
import { ChatRoomDetail } from '../../hooks/useChat';
import { api, ApiError } from '../../lib/api';
import { resizeImage } from '../../lib/image';
import { ChatNotifySetting } from './ChatNotifySetting';

/**
 * グループの作成・編集(要望: 全体・部署なども含めて手動で作る。名前・写真・メンバーをアカウント単位で選ぶ)。
 * room を渡すと編集モード(退出もここから)。
 */
export function GroupEditor({ room, onClose, onLeft }: { room?: ChatRoomDetail; onClose: () => void; onLeft?: () => void }) {
  const { data: me } = useMe();
  const { data: users } = useUserOptions();
  const { data: departments } = useDepartments();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(room?.name ?? '');
  const [photo, setPhoto] = useState<string | null>(room?.photo ?? null);
  const [members, setMembers] = useState<Set<string>>(new Set(room ? room.members.map((m) => m.id) : me ? [me.id] : []));
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const deptName = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? '';
  const filtered = (users ?? []).filter((u) => !q || u.name.includes(q) || deptName(u.departmentId).includes(q));

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ['chat'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: async () => {
      const body = { name, photo: photo ?? '', memberIds: [...members] };
      if (room) {
        await api.patch(`/chat/rooms/${room.id}`, body);
        return room.id;
      }
      const res = await api.post<{ id: string }>('/chat/rooms', body);
      return res.id;
    },
    onSuccess: (id) => {
      done();
      if (!room) navigate(`/chat/${id}`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '保存できませんでした'),
  });
  const leave = useMutation({
    mutationFn: () => api.post(`/chat/rooms/${room!.id}/leave`, {}),
    onSuccess: () => {
      done();
      onLeft?.();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '退出できませんでした'),
  });

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPhoto(await resizeImage(file, 256, { square: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '画像を読み込めませんでした');
    }
  };
  const toggle = (id: string) =>
    setMembers((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      if (me) n.add(me.id); // 自分は必ずメンバー(抜けるときは「退出」)
      return n;
    });
  // 部署単位でまとめて追加(部署のチャットを作るとき用)
  const addDepartment = (deptId: string) =>
    setMembers((cur) => new Set([...cur, ...(users ?? []).filter((u) => u.departmentId === deptId).map((u) => u.id)]));

  // 個人チャットは名前・写真・メンバーを変えられないので、通知設定と退出だけ
  if (room?.isDirect) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '100%', padding: 14 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>{room.name} との個人チャット</h2>
          <ChatNotifySetting roomId={room.id} />
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <button type="button" onClick={() => window.confirm('この個人チャットを一覧から外しますか？(相手から連絡があればまた表示されます)') && leave.mutate()} style={{ fontSize: 12, color: 'var(--color-danger)' }}>
              一覧から外す
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', padding: 14, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>{room ? 'グループ設定' : 'グループ作成'}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <button type="button" onClick={() => fileRef.current?.click()} title="グループ写真を選ぶ" style={{ padding: 0, border: 'none', background: 'transparent', boxShadow: 'none', position: 'relative' }}>
            <Avatar src={photo} name={name || 'グ'} seed={room?.id ?? name} size={60} square />
            <span style={{ position: 'absolute', right: -4, bottom: -4, fontSize: 9, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0 4px' }}>写真</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>グループ名</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: All / CT / 案件共有" style={{ fontSize: 14, height: 34 }} />
          </label>
        </div>
        {photo && (
          <button type="button" onClick={() => setPhoto(null)} style={{ alignSelf: 'flex-start', fontSize: 10, padding: '1px 6px', marginBottom: 8 }}>
            写真を外す
          </button>
        )}

        {room && <ChatNotifySetting roomId={room.id} />}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12 }}>メンバー({members.size}人)</span>
          <span style={{ display: 'flex', gap: 4 }}>
            <button type="button" onClick={() => setMembers(new Set((users ?? []).map((u) => u.id)))} style={{ fontSize: 10.5, padding: '1px 6px' }}>
              全員
            </button>
            <select value="" onChange={(e) => e.target.value && addDepartment(e.target.value)} style={{ fontSize: 10.5, padding: '1px 4px' }}>
              <option value="">部署ごと追加</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </span>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・部署で検索" style={{ fontSize: 13, height: 30, marginBottom: 6 }} />
        <div style={{ flex: 1, minHeight: 160, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          {filtered.map((u) => {
            const on = members.has(u.id);
            const self = u.id === me?.id;
            return (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '1px solid var(--color-sunken)', cursor: self ? 'default' : 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={on} disabled={self} onChange={() => toggle(u.id)} />
                <Avatar src={u.iconUrl} name={u.name} seed={u.id} size={26} />
                <span style={{ flex: 1 }}>
                  {u.name}
                  {self && <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>(自分)</span>}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>{deptName(u.departmentId)}</span>
              </label>
            );
          })}
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          {room && (
            <button
              type="button"
              onClick={() => window.confirm('このグループから退出しますか？') && leave.mutate()}
              style={{ fontSize: 12, color: 'var(--color-danger)' }}
            >
              退出
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
            キャンセル
          </button>
          <button type="button" className="btn-primary" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()} style={{ fontSize: 12 }}>
            {save.isPending ? '保存中...' : room ? '保存' : '作成'}
          </button>
        </div>
      </div>
    </div>
  );
}
