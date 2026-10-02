import { useEffect, useState } from 'react';

const PHONE_QUERY = '(max-width: 767px)';

/** スマホ幅かどうか。携帯用レイアウト(下メニュー・コンパクト一覧)の切り替えに使う。 */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const handler = () => setPhone(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return phone;
}
