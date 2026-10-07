const PALETTE = ['#3453d1', '#0e7c66', '#b45309', '#7c3aed', '#be185d', '#0369a1', '#4d7c0f', '#9f1239'];

/** アカウントの色(写真が無いときのアイコンの色。一覧で選択中のセルの色にも使う) */
export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** アカウント・グループの写真。写真が無ければ名前の頭文字を色付きで出す */
export function Avatar({
  src,
  name,
  size = 32,
  square = false,
  seed,
}: {
  src?: string | null;
  name: string;
  size?: number;
  /** 角丸の四角(グループ・自分のアカウントアイコン)。false は丸 */
  square?: boolean;
  seed?: string;
}) {
  const radius = square ? Math.round(size * 0.24) : '50%';
  if (src) {
    return <img src={src} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0, display: 'block' }} />;
  }
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        background: colorFor(seed ?? name),
        color: '#fff',
        fontSize: Math.round(size * 0.42),
        fontWeight: 900,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      {name.trim().slice(0, 1) || '?'}
    </span>
  );
}
