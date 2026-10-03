import { CSSProperties, useMemo } from 'react';
import { useMasterOrder, useStatuses, StatusMasterItem } from './useApi';
import { rowColorCategories } from '../lib/masterTabs';
import { rowColorStyle } from '../lib/rowColors';

/**
 * 一覧の行の塗りつぶし・文字色(要望)。fieldOf はカテゴリごとに「その行で選ばれている値」を返す
 * (選択肢のIDでも表示名でもよい。業種などは表示名そのものを保存しているため)。
 * マスタ管理で上にある項目ほど優先される。
 */
export function useMasterRowColors<T>(
  tabTitle: string,
  fieldOf: Record<string, (row: T) => string | null | undefined>,
): (row: T) => CSSProperties | undefined {
  const { data: statuses } = useStatuses();
  const { data: order } = useMasterOrder();

  const lookup = useMemo(() => {
    const map = new Map<string, Map<string, StatusMasterItem>>();
    for (const s of statuses ?? []) {
      let m = map.get(s.category);
      if (!m) map.set(s.category, (m = new Map()));
      m.set(s.id, s);
      if (!m.has(s.displayName)) m.set(s.displayName, s);
    }
    return map;
  }, [statuses]);

  const categories = useMemo(
    () => rowColorCategories(tabTitle, order).filter((c) => fieldOf[c]),
    // fieldOf は毎回作り直されるが、キーの集合は画面ごとに固定
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabTitle, order],
  );

  return (row: T) =>
    rowColorStyle(
      categories.map((c) => {
        const v = fieldOf[c](row);
        return v ? lookup.get(c)?.get(v) : undefined;
      }),
    );
}
