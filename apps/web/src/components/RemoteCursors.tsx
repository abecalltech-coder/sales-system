import { useEffect, useState } from 'react';
import { useRemotePointers, RemotePointer } from '../lib/remotePointers';
import { colorForUser } from '../lib/usePresence';
import { useMe } from '../hooks/useApi';

/** 動きが止まってからこの時間が経ったカーソルは消す(離席・別アプリへ移動など) */
const IDLE_HIDE_MS = 60_000;

/** 受け取った位置を今の自分の画面上の座標に直す。一覧の行が見当たらない(絞り込み・非表示)ときは出さない */
function locate(p: RemotePointer): { left: number; top: number } | null {
  if (p.rowId && p.columnKey) {
    const cell = document.querySelector<HTMLElement>(`td[data-row-id="${CSS.escape(p.rowId)}"][data-col-key="${CSS.escape(p.columnKey)}"]`);
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { left: r.left + (p.fx ?? 0.5) * r.width, top: r.top + (p.fy ?? 0.5) * r.height };
  }
  const main = document.querySelector('main');
  if (!main || p.x === undefined || p.y === undefined) return null;
  const r = main.getBoundingClientRect();
  return { left: r.left + p.x * r.width, top: r.top + p.y };
}

/**
 * 同じ画面を開いている他の人のマウスカーソルを、名前付きでアカウントの色で表示する(要望)。
 * 一覧の上ではセル基準で送り合うため、画面幅・並び順・スクロール位置が違っても同じ案件の上に出る。
 */
export function RemoteCursors() {
  const pointers = useRemotePointers();
  const { data: me } = useMe();
  // スクロール・サイズ変更・時間経過で描き直す
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const redraw = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setTick((t) => t + 1);
      });
    };
    window.addEventListener('scroll', redraw, true);
    window.addEventListener('resize', redraw);
    const timer = window.setInterval(redraw, 5000);
    return () => {
      window.removeEventListener('scroll', redraw, true);
      window.removeEventListener('resize', redraw);
      window.clearInterval(timer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const now = Date.now();
  const list = [...pointers.values()].filter((p) => p.userId !== me?.id && now - p.at < IDLE_HIDE_MS);
  if (list.length === 0) return null;

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2000, overflow: 'hidden' }}>
      {list.map((p) => {
        const pos = locate(p);
        if (!pos) return null;
        const color = colorForUser(p.userId);
        return (
          <div
            key={p.socketId}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `translate(${pos.left}px, ${pos.top}px)`,
              transition: 'transform 90ms linear',
              willChange: 'transform',
            }}
          >
            <svg width="16" height="18" viewBox="0 0 16 18" style={{ display: 'block', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.25))' }}>
              <path d="M1 1 L1 15 L5 11.5 L8 17 L10.5 15.8 L7.6 10.4 L13 10.4 Z" fill={color} stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: 14,
                whiteSpace: 'nowrap',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1.3,
                color: '#fff',
                background: color,
                padding: '1px 6px',
                borderRadius: 4,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {p.userName}
            </span>
          </div>
        );
      })}
    </div>
  );
}
