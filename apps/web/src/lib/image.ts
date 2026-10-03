/**
 * 画像ファイルを縮小して JPEG の data URL にする(アカウント写真・グループ写真・チャットの写真)。
 * サーバーへは縮小後のデータだけを送るので、通信量と保存容量を抑えられる。
 * square=true なら中央を正方形に切り抜く(アイコン用)。
 */
export async function resizeImage(file: File, maxSize: number, opts: { square?: boolean; quality?: number } = {}): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('画像を読み込めませんでした'));
      el.src = url;
    });
    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (opts.square) {
      const side = Math.min(sw, sh);
      sx = (sw - side) / 2;
      sy = (sh - side) / 2;
      sw = side;
      sh = side;
    }
    const scale = Math.min(1, maxSize / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像を処理できませんでした');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', opts.quality ?? 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
