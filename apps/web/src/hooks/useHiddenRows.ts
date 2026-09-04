import { useCallback, useState } from 'react';

/**
 * 一覧の行の非表示状態(Google Sheets の「行を非表示」相当)。
 * 端末ごとに記憶し(localStorage)、サーバーのデータには影響しない。
 */
export function useHiddenRows(tableKey: string) {
  const storageKey = `dt.hidden:${tableKey}`;

  const read = (): Set<string> => {
    try {
      const raw = localStorage.getItem(storageKey);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  };

  const [hidden, setHidden] = useState<Set<string>>(read);

  const persist = useCallback(
    (next: Set<string>) => {
      setHidden(new Set(next));
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* private mode */
      }
    },
    [storageKey],
  );

  const hide = useCallback(
    (ids: string[]) => {
      const next = read();
      ids.forEach((id) => next.add(id));
      persist(next);
    },
    [persist], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const unhide = useCallback(
    (ids: string[]) => {
      const next = read();
      ids.forEach((id) => next.delete(id));
      persist(next);
    },
    [persist], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const unhideAll = useCallback(() => persist(new Set()), [persist]);

  return { hidden, hide, unhide, unhideAll };
}
