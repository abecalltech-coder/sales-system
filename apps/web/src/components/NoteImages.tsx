import { useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { resizeImage } from '../lib/image';
import { useIsPhone } from '../lib/useIsPhone';

/**
 * メモ・稼働ルールに貼る画像(要望: 画像も入れられて、そのまま見えるように)。
 * PC はファイルから選ぶかドロップ、携帯は 写真を撮る / 写真から選ぶ / ファイルから選ぶ。
 * 画像は長辺1800px程度に縮めてから送る(通信量と保存容量を抑える)。
 */
export type NoteImageOwner = 'MEMO' | 'WORK_RULE';

/** 選んだ画像を縮める(貼る前の確認表示にも使う)。画像でないもの・読めないものはエラーにまとめる */
export async function shrinkImages(files: File[]): Promise<{ images: string[]; error: string | null }> {
  const images: string[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (file.type && !file.type.startsWith('image/')) {
      errors.push(`${file.name}: 画像ではありません`);
      continue;
    }
    try {
      images.push(await resizeImage(file, 1800, { quality: 0.82 }));
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : '読み込めませんでした'}`);
    }
  }
  return { images, error: errors.length ? errors.join('\n') : null };
}

/** 縮めた画像を貼る。作った画像のIDと、失敗したもののメッセージを返す */
export async function postNoteImages(ownerType: NoteImageOwner, ownerId: string, images: string[]): Promise<{ ids: string[]; error: string | null }> {
  const ids: string[] = [];
  const errors: string[] = [];
  for (const image of images) {
    try {
      ids.push((await api.post<{ id: string }>('/note-images', { ownerType, ownerId, image })).id);
    } catch (e) {
      errors.push(e instanceof ApiError ? e.message : '貼り付けできませんでした');
    }
  }
  return { ids, error: errors.length ? [...new Set(errors)].join('\n') : null };
}

/** 選んだ画像を縮めて貼る */
export async function uploadNoteImages(ownerType: NoteImageOwner, ownerId: string, files: File[]): Promise<{ ids: string[]; error: string | null }> {
  const shrunk = await shrinkImages(files);
  const posted = await postNoteImages(ownerType, ownerId, shrunk.images);
  return { ids: posted.ids, error: [shrunk.error, posted.error].filter(Boolean).join('\n') || null };
}

/** ドロップで画像を受け取る(PC)。ドラッグ中は枠を出す */
export function useImageDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  return {
    over,
    handlers: {
      onDragEnter: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      onDragOver: (e: React.DragEvent) => {
        if (hasFiles(e)) e.preventDefault();
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => !f.type || f.type.startsWith('image/'));
        if (files.length) onFiles(files);
      },
    },
  };
}

/** 画像を追加するボタン。携帯は 写真を撮る / 写真から選ぶ / ファイルから選ぶ、PC はファイルから選ぶ(ドロップも可) */
export function ImageAddButtons({ onFiles, busy }: { onFiles: (files: File[]) => void; busy?: boolean }) {
  const isPhone = useIsPhone();
  const camera = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (list.length) onFiles(list);
  };
  const btn: React.CSSProperties = { fontSize: isPhone ? 12 : 11, padding: isPhone ? '6px 10px' : '3px 9px' };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={photos} type="file" accept="image/*" multiple hidden onChange={pick} />
      {/* 拡張子で指定すると、携帯でも写真アプリではなくファイルの画面が開く */}
      <input ref={files} type="file" accept=".jpg,.jpeg,.png,.heic,.heif,.webp,.gif" multiple hidden onChange={pick} />
      {isPhone ? (
        <>
          <button type="button" disabled={busy} onClick={() => camera.current?.click()} style={btn}>
            写真を撮る
          </button>
          <button type="button" disabled={busy} onClick={() => photos.current?.click()} style={btn}>
            写真から選ぶ
          </button>
          <button type="button" disabled={busy} onClick={() => files.current?.click()} style={btn}>
            ファイルから選ぶ
          </button>
        </>
      ) : (
        <>
          <button type="button" disabled={busy} onClick={() => photos.current?.click()} style={btn}>
            画像を追加
          </button>
          <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>ここに画像をドロップしても追加できます</span>
        </>
      )}
      {busy && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>画像を貼り付け中...</span>}
    </div>
  );
}

/** 貼った画像をそのままの大きさ(枠の幅いっぱいまで)で表示する。押すと原寸で開く */
export function NoteImageList({ ids, onRemove }: { ids: string[]; onRemove?: (id: string) => void }) {
  if (ids.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ids.map((id) => (
        <div key={id} style={{ position: 'relative', alignSelf: 'flex-start', maxWidth: '100%' }}>
          <a href={`/api/note-images/${id}`} target="_blank" rel="noreferrer">
            <img
              src={`/api/note-images/${id}`}
              alt="貼り付けた画像"
              loading="lazy"
              style={{ display: 'block', maxWidth: '100%', maxHeight: '80vh', borderRadius: 6, border: '1px solid var(--color-border)' }}
            />
          </a>
          {onRemove && (
            <button
              type="button"
              onClick={() => window.confirm('この画像を削除しますか？') && onRemove(id)}
              style={{ position: 'absolute', top: 6, right: 6, fontSize: 11, padding: '2px 8px', color: 'var(--color-danger)' }}
            >
              削除
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
