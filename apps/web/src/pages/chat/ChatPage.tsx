import { Fragment, useEffect, useMemo, useRef, useState, TouchEvent as ReactTouchEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { Avatar } from '../../components/Avatar';
import { useIsPhone } from '../../lib/useIsPhone';
import { useMe } from '../../hooks/useApi';
import { useChatMessages, useChatRoom, useChatRooms, ChatMessageItem, ChatRoomItem } from '../../hooks/useChat';
import { api, ApiError } from '../../lib/api';
import { resizeImage } from '../../lib/image';
import { logCopy } from '../../lib/copyLog';
import { GroupEditor } from './GroupEditor';

const ACCOUNT_BAR_HEIGHT = 36;
// 下メニューの高さ(52px)+ 枠線。ホームバーのある端末は safe-area 分を足す
const PHONE_NAV_HEIGHT = 53 + safeAreaBottom();

function safeAreaBottom(): number {
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom);visibility:hidden';
  document.body.appendChild(probe);
  const h = probe.offsetHeight;
  probe.remove();
  return h;
}

/** 画面に実際に見えている範囲(携帯のキーボード表示中は縮む)。visualViewport が無い端末は window の大きさ */
function useVisibleViewport(enabled: boolean) {
  const read = () => {
    const v = window.visualViewport;
    return { height: v?.height ?? window.innerHeight, offsetTop: v?.offsetTop ?? 0 };
  };
  const [box, setBox] = useState(read);
  useEffect(() => {
    if (!enabled) return;
    const v = window.visualViewport;
    const update = () => setBox(read());
    update();
    v?.addEventListener('resize', update);
    v?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      v?.removeEventListener('resize', update);
      v?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);
  return box;
}

const MENTION_ALL = 'all';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 本文の「@名前」を強調表示する。自分宛ては色を変える */
function renderBody(body: string, members: { id: string; name: string }[], myId: string | undefined, mine: boolean) {
  const names = [...members.map((m) => m.name), '全員'].filter(Boolean).sort((a, b) => b.length - a.length);
  if (names.length === 0 || !body.includes('@')) return body;
  const re = new RegExp(`@(${names.map(escapeRe).join('|')})`, 'g');
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push(body.slice(last, i));
    const target = m[1];
    const toMe = target === '全員' || members.find((x) => x.name === target)?.id === myId;
    out.push(
      <span
        key={i}
        style={{
          fontWeight: 900,
          color: mine ? '#fff' : 'var(--color-primary)',
          background: toMe && !mine ? 'rgba(234, 179, 8, 0.3)' : undefined,
          borderRadius: 3,
          padding: '0 1px',
        }}
      >
        {m[0]}
      </span>,
    );
    last = i + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
const dayKey = (iso: string) => new Date(iso).toDateString();
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
function listTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return timeOf(iso);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '昨日';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** チャット(要望)。PCは一覧と会話を横並び、携帯は一覧→会話の画面遷移 */
export function ChatPage() {
  const { roomId } = useParams();
  const isPhone = useIsPhone();
  const [creating, setCreating] = useState(false);

  const vv = useVisibleViewport(isPhone);
  // 携帯: 画面に見えている範囲(キーボード表示中はその上まで)にぴったり合わせて固定表示する(要望: 画面が合わない)。
  const phoneBox: React.CSSProperties = {
    position: 'fixed',
    left: 0,
    right: 0,
    // トーク中は上のアカウントバー・下メニューの上にも重ねて全画面で使う(戻るボタンで一覧へ)
    top: vv.offsetTop + (roomId ? 0 : ACCOUNT_BAR_HEIGHT),
    height: Math.max(200, roomId ? vv.height : vv.height - ACCOUNT_BAR_HEIGHT - PHONE_NAV_HEIGHT),
    zIndex: roomId ? 310 : 1,
    display: 'flex',
    background: 'var(--color-bg)',
    overscrollBehavior: 'contain',
  };

  return (
    <AppLayout>
      <div style={isPhone ? phoneBox : { display: 'flex', height: 'calc(var(--viewport-height, 100vh) - 36px)', minHeight: 0 }}>
        {(!isPhone || !roomId) && (
          <RoomList activeId={roomId} wide={isPhone} onCreate={() => setCreating(true)} />
        )}
        {roomId ? (
          <RoomView key={roomId} roomId={roomId} showBack={isPhone} />
        ) : (
          !isPhone && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-faint)', fontSize: 13 }}>
              トークを選んでください
            </div>
          )
        )}
      </div>
      {creating && <GroupEditor onClose={() => setCreating(false)} />}
    </AppLayout>
  );
}

function RoomList({ activeId, wide, onCreate }: { activeId?: string; wide: boolean; onCreate: () => void }) {
  const { data: rooms, isLoading } = useChatRooms();
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const filtered = (rooms ?? []).filter((r) => !q || r.name.includes(q));

  return (
    <section
      aria-label="トーク一覧"
      style={{
        width: wide ? '100%' : 300,
        flexShrink: 0,
        background: 'var(--color-surface)',
        borderRight: wide ? 'none' : '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>チャット</h1>
          <button type="button" className="btn-primary" onClick={onCreate} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 16 }}>
            ＋ グループ作成
          </button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="トークを検索" style={{ height: 30, fontSize: 13 }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && <p style={{ padding: 16, fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
        {!isLoading && filtered.length === 0 && (
          <p style={{ padding: 16, fontSize: 12, color: 'var(--color-text-faint)' }}>
            {rooms?.length ? '該当するトークはありません' : 'まだトークがありません。「グループ作成」から作れます。'}
          </p>
        )}
        {filtered.map((r) => (
          <RoomRow key={r.id} room={r} active={r.id === activeId} onOpen={() => navigate(`/chat/${r.id}`)} />
        ))}
      </div>
    </section>
  );
}

function RoomRow({ room, active, onOpen }: { room: ChatRoomItem; active: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 10px',
        border: 'none',
        borderBottom: '1px solid var(--color-sunken)',
        borderRadius: 0,
        boxShadow: 'none',
        background: active ? 'var(--color-primary-soft)' : 'transparent',
        textAlign: 'left',
        font: 'inherit',
        color: 'var(--color-text)',
      }}
    >
      <Avatar src={room.photo} name={room.name} seed={room.id} size={40} square />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {room.name}
            <span style={{ fontSize: 11, color: 'var(--color-text-faint)', marginLeft: 4 }}>({room.memberCount})</span>
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--color-text-faint)' }}>{listTime(room.lastMessage?.createdAt ?? room.lastMessageAt)}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {room.lastMessage ? `${room.lastMessage.senderName}: ${room.lastMessage.text}` : 'メッセージはまだありません'}
          </span>
          {room.unreadMentions > 0 && (
            <span title="あなた宛てのメンションがあります" style={{ fontSize: 10, fontWeight: 900, color: '#fff', background: '#ca8a04', borderRadius: 4, padding: '0 4px' }}>
              @メンション
            </span>
          )}
          {room.unread > 0 && <span className="chat-badge">{room.unread > 99 ? '99+' : room.unread}</span>}
        </span>
      </span>
    </button>
  );
}

type MenuState = { message: ChatMessageItem; x: number; y: number };

function RoomView({ roomId, showBack }: { roomId: string; showBack: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const { data: room } = useChatRoom(roomId);
  const { data, isLoading } = useChatMessages(roomId);
  const messages = useMemo(() => data?.messages ?? [], [data]);
  const isPhone = useIsPhone();

  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageItem | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [partial, setPartial] = useState<ChatMessageItem | null>(null);
  const [selecting, setSelecting] = useState<Set<string> | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [readersOf, setReadersOf] = useState<ChatMessageItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastCount = useRef(0);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1500);
  };
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['chat', 'messages', roomId] });
    queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] });
  };

  // 開いている間は既読にする(新着が来たときも)
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!lastId || document.visibilityState !== 'visible') return;
    api
      .post(`/chat/rooms/${roomId}/read`, {})
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['chat', 'unread'] });
        queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] });
      })
      .catch(() => undefined);
  }, [lastId, roomId, queryClient]);

  // 新しい発言が増えたら一番下へ
  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: (v: { body?: string; image?: string; replyToId?: string; mentions?: string[] }) => api.post(`/chat/rooms/${roomId}/messages`, v),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '送信できませんでした'),
  });
  const unsendMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/chat/messages/${id}`),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : '取り消せませんでした'),
  });

  // メンション候補: カーソル直前が「@文字」のとき、メンバー(と全員)を出す
  const members = room?.members ?? [];
  const mentionQuery = (() => {
    const m = /@([^\s@]*)$/.exec(text.slice(0, cursor));
    return m ? m[1] : null;
  })();
  const mentionCandidates =
    mentionQuery === null
      ? []
      : [{ id: MENTION_ALL, name: '全員', iconUrl: null as string | null }, ...members.filter((m) => m.id !== me?.id)].filter((m) =>
          m.name.includes(mentionQuery),
        );
  const pickMention = (name: string) => {
    const before = text.slice(0, cursor).replace(/@([^\s@]*)$/, `@${name} `);
    const next = before + text.slice(cursor);
    setText(next);
    setCursor(before.length);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(before.length, before.length);
    }, 0);
  };
  // 送信時に本文中の「@名前」からメンション先を決める
  // 名前が他の人の名前を含む場合(例: 田中 と 田中太郎)も取り違えないよう、長い名前から照合する
  const mentionsIn = (body: string) => {
    const names = [...members.map((m) => m.name), '全員'].filter(Boolean).sort((a, b) => b.length - a.length);
    if (!body.includes('@') || names.length === 0) return [];
    const re = new RegExp(`@(${names.map(escapeRe).join('|')})`, 'g');
    const ids = new Set<string>();
    for (const m of body.matchAll(re)) {
      if (m[1] === '全員') ids.add(MENTION_ALL);
      else members.filter((x) => x.name === m[1] && x.id !== me?.id).forEach((x) => ids.add(x.id));
    }
    return [...ids];
  };

  const send = () => {
    if (!text.trim()) return;
    sendMutation.mutate({ body: text, replyToId: replyTo?.id, mentions: mentionsIn(text) });
    setText('');
    setCursor(0);
    setReplyTo(null);
  };
  const sendImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const image = await resizeImage(file, 1280, { quality: 0.75 });
      sendMutation.mutate({ image, replyToId: replyTo?.id });
      setReplyTo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '写真を送れませんでした');
    }
  };

  const copy = async (m: ChatMessageItem) => {
    const t = m.forwardBundle ? m.forwardBundle.map((f) => `${f.senderName}: ${f.body ?? '[写真]'}`).join('\n') : (m.body ?? '');
    try {
      await navigator.clipboard.writeText(t);
      logCopy('チャット', t, { target: room?.name });
      flash('コピーしました');
    } catch {
      flash('コピーできませんでした');
    }
  };

  const toggleSelect = (id: string) =>
    setSelecting((cur) => {
      const next = new Set(cur ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-label="トーク" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', minHeight: 0 }}>
      <div style={{ background: 'var(--color-surface)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--color-border)' }}>
        {showBack && (
          <button type="button" onClick={() => navigate('/chat')} aria-label="戻る" style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'transparent', boxShadow: 'none' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        )}
        <Avatar src={room?.photo} name={room?.name ?? ''} seed={roomId} size={32} square />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 14, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room?.name}</span>
          <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>メンバー {room?.members.length ?? 0}人</span>
        </span>
        <button type="button" onClick={() => setEditing(true)} style={{ fontSize: 11, padding: '3px 10px' }}>
          グループ設定
        </button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isLoading && <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
        {data?.hasMore && <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-faint)' }}>これより前の発言は省略しています</p>}
        {messages.map((m, i) => (
          <Fragment key={m.id}>
            {(i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt)) && (
              <div style={{ alignSelf: 'center', fontSize: 10.5, color: 'var(--color-text-muted)', background: 'var(--color-border)', padding: '1px 10px', borderRadius: 10 }}>{dayLabel(m.createdAt)}</div>
            )}
            <MessageRow
              m={m}
              mine={m.senderId === me?.id}
              members={members}
              myId={me?.id}
              selecting={selecting}
              onToggleSelect={() => toggleSelect(m.id)}
              onMenu={(x, y) => !m.unsent && setMenu({ message: m, x, y })}
              onReaders={() => setReadersOf(m)}
              onImage={setViewImage}
              isPhone={isPhone}
            />
          </Fragment>
        ))}
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, padding: '4px 12px', margin: 0, background: 'var(--color-surface)' }}>{error}</p>}

      {selecting ? (
        <div style={{ background: 'var(--color-surface)', padding: '8px 10px', paddingBottom: isPhone ? 'max(8px, env(safe-area-inset-bottom))' : 8, display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--color-border)' }}>
          <span style={{ flex: 1, fontSize: 12 }}>{selecting.size}件を選択中(転送するトークを選んでください)</span>
          <button type="button" onClick={() => setSelecting(null)} style={{ fontSize: 12, padding: '5px 10px' }}>
            キャンセル
          </button>
          <button type="button" className="btn-primary" disabled={selecting.size === 0} onClick={() => setForwardOpen(true)} style={{ fontSize: 12, padding: '5px 12px' }}>
            転送
          </button>
        </div>
      ) : (
        <div style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', padding: '6px 8px', paddingBottom: isPhone ? 'max(6px, env(safe-area-inset-bottom))' : 6 }}>
          {replyTo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', marginBottom: 6, borderRadius: 8, background: 'var(--color-sunken)', fontSize: 11.5 }}>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <b>{replyTo.senderName}</b> へのリプライ: {replyTo.body ?? (replyTo.image ? '写真' : 'トーク')}
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="リプライをやめる" style={{ width: 22, height: 22, padding: 0, fontSize: 12 }}>
                ×
              </button>
            </div>
          )}
          {mentionCandidates.length > 0 && (
            <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 6, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface)' }}>
              {mentionCandidates.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickMention(m.name)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: 'none', borderRadius: 0, boxShadow: 'none', background: 'transparent', fontSize: 13, textAlign: 'left' }}
                >
                  <Avatar src={m.iconUrl} name={m.name} seed={m.id} size={24} />
                  {m.name}
                  {m.id === MENTION_ALL && <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>(このトークの全員)</span>}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="写真を送る" style={{ width: 36, height: 36, padding: 0, border: 'none', background: 'transparent', boxShadow: 'none', color: 'var(--color-text-muted)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              </svg>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void sendImage(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => {
                const pos = inputRef.current?.selectionStart ?? text.length;
                const next = text.slice(0, pos) + '@' + text.slice(pos);
                setText(next);
                setCursor(pos + 1);
                window.setTimeout(() => {
                  inputRef.current?.focus();
                  inputRef.current?.setSelectionRange(pos + 1, pos + 1);
                }, 0);
              }}
              aria-label="メンション"
              title="メンション(@)"
              style={{ width: 30, height: 36, padding: 0, border: 'none', background: 'transparent', boxShadow: 'none', fontSize: 18, fontWeight: 900, color: 'var(--color-text-muted)' }}
            >
              @
            </button>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setCursor(e.target.selectionStart ?? e.target.value.length);
              }}
              onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
              onKeyDown={(e) => {
                // PCは Enter で送信 / Shift+Enter で改行。携帯は Enter で改行(送信ボタンで送る)
                if (!isPhone && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={isPhone ? 'メッセージを入力' : 'メッセージを入力(Enterで送信 / Shift+Enterで改行)'}
              // 携帯は16px未満だと入力時に画面が拡大されてずれるため16pxにする
              style={{ flex: 1, minWidth: 0, minHeight: 36, maxHeight: 140, padding: '8px 12px', borderRadius: 18, fontSize: isPhone ? 16 : 14, resize: 'none', fieldSizing: 'content' } as React.CSSProperties}
            />
            <button type="button" onClick={send} disabled={!text.trim() || sendMutation.isPending} aria-label="送信" className="btn-primary" style={{ width: 36, height: 36, padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {menu && (
        <MessageMenu
          state={menu}
          mine={menu.message.senderId === me?.id}
          onClose={() => setMenu(null)}
          onCopy={() => copy(menu.message)}
          onPartial={() => setPartial(menu.message)}
          onReply={() => setReplyTo(menu.message)}
          onUnsend={() => {
            if (window.confirm('このメッセージの送信を取り消しますか？(相手の画面からも消えます)')) unsendMutation.mutate(menu.message.id);
          }}
          onForward={() => setSelecting(new Set([menu.message.id]))}
        />
      )}
      {partial && <PartialCopy message={partial} onClose={() => setPartial(null)} onCopied={() => flash('コピーしました')} />}
      {forwardOpen && selecting && (
        <ForwardPicker
          messageIds={messages.filter((m) => selecting.has(m.id)).map((m) => m.id)}
          currentRoomId={roomId}
          onClose={() => setForwardOpen(false)}
          onDone={() => {
            setForwardOpen(false);
            setSelecting(null);
            flash('転送しました');
          }}
        />
      )}
      {readersOf && <ReadersSheet message={readersOf} onClose={() => setReadersOf(null)} />}
      {editing && room && <GroupEditor room={room} onClose={() => setEditing(false)} onLeft={() => navigate('/chat')} />}
      {viewImage && (
        <div onClick={() => setViewImage(null)} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={viewImage} alt="" style={{ maxWidth: '96vw', maxHeight: '90vh', objectFit: 'contain' }} />
        </div>
      )}
      {toast && <div className="chat-toast">{toast}</div>}
    </section>
  );
}

const LONG_PRESS_MS = 450;
const SWIPE_PX = 60;

function MessageRow({
  m,
  mine,
  members,
  myId,
  selecting,
  onToggleSelect,
  onMenu,
  onReaders,
  onImage,
  isPhone,
}: {
  m: ChatMessageItem;
  mine: boolean;
  members: { id: string; name: string }[];
  myId: string | undefined;
  selecting: Set<string> | null;
  onToggleSelect: () => void;
  onMenu: (x: number, y: number) => void;
  onReaders: () => void;
  onImage: (src: string) => void;
  isPhone: boolean;
}) {
  const [dx, setDx] = useState(0);
  const touch = useRef<{ x: number; y: number; timer?: number; fired?: boolean } | null>(null);

  // 長押し、または横にスライドで操作メニュー(要望)
  const onTouchStart = (e: ReactTouchEvent) => {
    const t = e.touches[0];
    const st: { x: number; y: number; timer?: number; fired?: boolean } = { x: t.clientX, y: t.clientY };
    st.timer = window.setTimeout(() => {
      st.fired = true;
      onMenu(st.x, st.y);
    }, LONG_PRESS_MS);
    touch.current = st;
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    const st = touch.current;
    if (!st) return;
    const t = e.touches[0];
    const mx = t.clientX - st.x;
    const my = t.clientY - st.y;
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) window.clearTimeout(st.timer);
    if (Math.abs(mx) > Math.abs(my)) setDx(Math.max(-90, Math.min(90, mx)));
  };
  const onTouchEnd = () => {
    const st = touch.current;
    if (st) window.clearTimeout(st.timer);
    if (Math.abs(dx) >= SWIPE_PX && st && !st.fired) onMenu(st.x, st.y);
    setDx(0);
    touch.current = null;
  };

  const selected = selecting?.has(m.id) ?? false;
  const mentionsMe = !mine && (m.mentions.includes(MENTION_ALL) || (!!myId && m.mentions.includes(myId)));
  const bubbleBase: React.CSSProperties = {
    maxWidth: isPhone ? 'min(72vw, 280px)' : 420,
    padding: '7px 11px',
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    WebkitTouchCallout: 'none',
  };
  const bubble: React.CSSProperties = mine
    ? { ...bubbleBase, borderRadius: '14px 14px 4px 14px', background: 'var(--color-primary)', color: '#fff' }
    : { ...bubbleBase, borderRadius: '14px 14px 14px 4px', background: 'var(--color-surface)', color: 'var(--color-text)' };

  const content = m.unsent ? (
    <span style={{ fontSize: 12, color: 'var(--color-text-faint)', fontStyle: 'italic' }}>メッセージの送信を取り消しました</span>
  ) : (
    <div
      style={bubble}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      onTouchStart={selecting ? undefined : onTouchStart}
      onTouchMove={selecting ? undefined : onTouchMove}
      onTouchEnd={selecting ? undefined : onTouchEnd}
    >
      {m.replyTo && (
        <div style={{ fontSize: 11, padding: '3px 7px', marginBottom: 4, borderRadius: 6, background: mine ? 'rgba(255,255,255,0.18)' : 'var(--color-sunken)' }}>
          <b>{m.replyTo.senderName}</b>: {m.replyTo.text}
        </div>
      )}
      {m.forwardedFrom && <div style={{ fontSize: 10.5, opacity: 0.8, marginBottom: 2 }}>転送: {m.forwardedFrom}</div>}
      {m.forwardBundle ? (
        <ForwardBundle items={m.forwardBundle} mine={mine} onImage={onImage} />
      ) : (
        <>
          {m.image && (
            <button type="button" onClick={() => onImage(m.image!)} style={{ display: 'block', padding: 0, border: 'none', background: 'transparent', boxShadow: 'none' }}>
              <img src={m.image} alt="送信された写真" style={{ display: 'block', maxWidth: '100%', maxHeight: 240, borderRadius: 8 }} />
            </button>
          )}
          {m.body && renderBody(m.body, members, myId, mine)}
        </>
      )}
    </div>
  );

  return (
    <div
      onClick={selecting && !m.unsent ? onToggleSelect : undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 6,
        justifyContent: mine ? 'flex-end' : 'flex-start',
        transform: dx ? `translateX(${dx}px)` : undefined,
        transition: dx ? undefined : 'transform 0.15s ease',
        cursor: selecting ? 'pointer' : undefined,
        background: selected ? 'var(--color-primary-soft)' : undefined,
        borderRadius: 8,
        padding: selecting ? '2px 4px' : 0,
      }}
    >
      {selecting && !m.unsent && (
        <span
          aria-hidden
          style={{
            order: mine ? -1 : 0,
            alignSelf: 'center',
            width: 20,
            height: 20,
            borderRadius: '50%',
            flexShrink: 0,
            border: selected ? 'none' : '2px solid var(--color-border-strong)',
            background: selected ? 'var(--color-primary)' : 'transparent',
            color: '#fff',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? '✓' : ''}
        </span>
      )}
      {!mine && <Avatar src={m.senderIcon} name={m.senderName} seed={m.senderId} size={30} />}
      {mine && !m.unsent && (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 10, color: 'var(--color-text-faint)' }}>
          {m.readCount > 0 && (
            <button type="button" onClick={(e) => (e.stopPropagation(), onReaders())} style={{ padding: 0, border: 'none', background: 'transparent', boxShadow: 'none', fontSize: 10, color: 'var(--color-primary)', textDecoration: 'underline' }}>
              既読 {m.readCount}
            </button>
          )}
          <span>{timeOf(m.createdAt)}</span>
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: mine ? 'flex-end' : 'flex-start', minWidth: 0 }}>
        {!mine && (
          <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
            {m.senderName}
            {mentionsMe && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 900, color: '#a16207' }}>@あなた宛て</span>}
          </span>
        )}
        {content}
      </span>
      {!mine && <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>{timeOf(m.createdAt)}</span>}
    </div>
  );
}

function ForwardBundle({ items, mine, onImage }: { items: ChatMessageItem['forwardBundle'] & object; mine: boolean; onImage: (s: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 4);
  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 4 }}>転送されたトーク({items.length}件)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 8px', borderRadius: 8, background: mine ? 'rgba(255,255,255,0.15)' : 'var(--color-sunken)' }}>
        {shown.map((f, i) => (
          <div key={i} style={{ fontSize: 12.5 }}>
            <span style={{ fontSize: 10.5, opacity: 0.8 }}>
              {f.senderName} {timeOf(f.createdAt)}
            </span>
            <div>
              {f.image && (
                <button type="button" onClick={() => onImage(f.image!)} style={{ padding: 0, border: 'none', background: 'transparent', boxShadow: 'none', display: 'block' }}>
                  <img src={f.image} alt="" style={{ maxWidth: 160, maxHeight: 120, borderRadius: 6 }} />
                </button>
              )}
              {f.body}
            </div>
          </div>
        ))}
      </div>
      {items.length > 4 && (
        <button type="button" onClick={() => setAll((v) => !v)} style={{ marginTop: 4, padding: 0, border: 'none', background: 'transparent', boxShadow: 'none', fontSize: 11, color: 'inherit', textDecoration: 'underline' }}>
          {all ? '閉じる' : `すべて見る(${items.length}件)`}
        </button>
      )}
    </div>
  );
}

function MessageMenu({
  state,
  mine,
  onClose,
  onCopy,
  onPartial,
  onReply,
  onUnsend,
  onForward,
}: {
  state: MenuState;
  mine: boolean;
  onClose: () => void;
  onCopy: () => void;
  onPartial: () => void;
  onReply: () => void;
  onUnsend: () => void;
  onForward: () => void;
}) {
  const run = (f: () => void) => () => {
    f();
    onClose();
  };
  const hasText = !!state.message.body || !!state.message.forwardBundle;
  const item: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'transparent', boxShadow: 'none', fontSize: 13, borderRadius: 6 };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2500 }} onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())}>
      <div
        className="popover"
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'fixed', top: Math.max(8, Math.min(state.y, window.innerHeight - 250)), left: Math.max(8, Math.min(state.x, window.innerWidth - 190)), width: 180, padding: 4 }}
      >
        {hasText && (
          <button type="button" style={item} onClick={run(onCopy)}>
            コピー
          </button>
        )}
        {hasText && (
          <button type="button" style={item} onClick={run(onPartial)}>
            部分コピー
          </button>
        )}
        <button type="button" style={item} onClick={run(onReply)}>
          リプライ
        </button>
        <button type="button" style={item} onClick={run(onForward)}>
          転送(複数選択できます)
        </button>
        {mine && (
          <button type="button" style={{ ...item, color: 'var(--color-danger)' }} onClick={run(onUnsend)}>
            送信取り消し
          </button>
        )}
      </div>
    </div>
  );
}

/** 部分コピー: 本文を選べる状態で表示し、選んだ範囲(未選択なら全文)をコピー */
function PartialCopy({ message, onClose, onCopied }: { message: ChatMessageItem; onClose: () => void; onCopied: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = message.forwardBundle ? message.forwardBundle.map((f) => `${f.senderName}: ${f.body ?? '[写真]'}`).join('\n') : (message.body ?? '');
  const copySelection = async () => {
    const el = ref.current;
    const sel = el && el.selectionEnd > el.selectionStart ? text.slice(el.selectionStart, el.selectionEnd) : text;
    try {
      await navigator.clipboard.writeText(sel);
      logCopy('チャット(部分コピー)', sel);
      onCopied();
      onClose();
    } catch {
      el?.focus();
      document.execCommand('copy');
      onCopied();
      onClose();
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, width: '100%', padding: 14 }}>
        <h2 style={{ fontSize: 14, margin: '0 0 6px' }}>部分コピー</h2>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>コピーしたい部分をなぞって選び、「選択部分をコピー」を押してください。</p>
        <textarea ref={ref} readOnly defaultValue={text} rows={Math.min(12, Math.max(3, text.split('\n').length + 1))} style={{ width: '100%', fontSize: 14, lineHeight: 1.6, boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
          <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
            閉じる
          </button>
          <button type="button" className="btn-primary" onClick={() => void copySelection()} style={{ fontSize: 12 }}>
            選択部分をコピー
          </button>
        </div>
      </div>
    </div>
  );
}

function ForwardPicker({ messageIds, currentRoomId, onClose, onDone }: { messageIds: string[]; currentRoomId: string; onClose: () => void; onDone: () => void }) {
  const { data: rooms } = useChatRooms();
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.post('/chat/forward', { messageIds, targetRoomIds: [...targets] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '転送できませんでした'),
  });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, width: '100%', padding: 14, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: 14, margin: '0 0 4px' }}>転送先を選ぶ</h2>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
          {messageIds.length > 1 ? `${messageIds.length}件のやり取りを1つにまとめて転送します。` : '1件のメッセージを転送します。'}
        </p>
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          {(rooms ?? []).map((r) => {
            const on = targets.has(r.id);
            return (
              <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--color-sunken)', cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setTargets((cur) => {
                      const n = new Set(cur);
                      if (on) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    })
                  }
                />
                <Avatar src={r.photo} name={r.name} seed={r.id} size={26} square />
                <span style={{ flex: 1 }}>
                  {r.name}
                  {r.id === currentRoomId && <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>(このトーク)</span>}
                </span>
              </label>
            );
          })}
        </div>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
          <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
            キャンセル
          </button>
          <button type="button" className="btn-primary" disabled={targets.size === 0 || mutation.isPending} onClick={() => mutation.mutate()} style={{ fontSize: 12 }}>
            {mutation.isPending ? '転送中...' : `${targets.size}件のトークへ転送`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReadersSheet({ message, onClose }: { message: ChatMessageItem; onClose: () => void }) {
  const [data, setData] = useState<{ read: { id: string; name: string; iconUrl: string | null }[]; unread: { id: string; name: string; iconUrl: string | null }[] } | null>(null);
  useEffect(() => {
    api
      .get<NonNullable<typeof data>>(`/chat/messages/${message.id}/readers`)
      .then(setData)
      .catch(() => setData({ read: [], unread: [] }));
  }, [message.id]);
  const row = (u: { id: string; name: string; iconUrl: string | null }) => (
    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
      <Avatar src={u.iconUrl} name={u.name} seed={u.id} size={26} />
      {u.name}
    </div>
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340, width: '100%', padding: 14, maxHeight: '80vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>既読 {data?.read.length ?? message.readCount}人</h2>
        {!data && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
        {data?.read.map(row)}
        {data && data.unread.length > 0 && (
          <>
            <h3 style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '12px 0 4px' }}>未読 {data.unread.length}人</h3>
            {data.unread.map(row)}
          </>
        )}
        <div style={{ textAlign: 'right', marginTop: 10 }}>
          <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
