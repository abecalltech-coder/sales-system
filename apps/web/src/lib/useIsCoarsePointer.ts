import { useEffect, useState } from 'react';

/**
 * タッチ操作(スマホ・タブレット)かどうかを判定する。ソフトキーボードの端末では
 * PCのようなShift/Ctrl/Altキー併用がしづらいため、「確定」ボタンの表示切り替えに使う。
 */
export function useIsCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const handler = () => setCoarse(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return coarse;
}
