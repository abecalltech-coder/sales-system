import type { Worker } from 'tesseract.js';

/**
 * 明細読み取り(要望: 電気明細の写真を完全無料でテキスト化)。
 * 文字認識はブラウザ内(Tesseract.js / WebAssembly)で行い、写真も文字も外部へ送らない。
 * エンジンと日本語データは自サーバーの /ocr/ から配る(初回のみ約10MBを読み込み、以降は端末に保存)。
 */
let workerPromise: Promise<Worker> | null = null;
let progressHandler: ((p: number, status: string) => void) | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      const worker = await createWorker('jpn', OEM.LSTM_ONLY, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr',
        langPath: '/ocr',
        gzip: true,
        // blob: のワーカーはCSPで禁止されているため、自サーバーのファイルを直接使う
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => progressHandler?.(m.progress, m.status),
      });
      // 明細は表組みが多いので、ブロック単位で自動判定させる
      await worker.setParameters({ preserve_interword_spaces: '1' });
      return worker;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/** 写真を読み取りやすく整える(白黒化・コントラスト強調・小さい写真は拡大) */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('写真を読み込めませんでした'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('この写真の形式は読み込めませんでした(JPEG/PNGをお試しください)'));
    el.src = url;
  });
  // 文字が潰れない程度の大きさにそろえる(長辺 2400px 前後)
  const target = 2400;
  const scale = Math.min(2.5, target / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('写真を処理できませんでした');
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  // 明るさの分布から自動でコントラストを広げる
  let min = 255;
  let max = 0;
  for (let i = 0; i < px.length; i += 16) {
    const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (y < min) min = y;
    if (y > max) max = y;
  }
  const range = Math.max(40, max - min);
  for (let i = 0; i < px.length; i += 4) {
    const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = Math.max(0, Math.min(255, ((y - min) / range) * 255));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** 認識結果の整形: 日本語の文字間に入る余計な空白を詰め、全角英数字を半角にする */
export function normalizeOcrText(raw: string): string {
  const cjk = '\\u3000-\\u30ff\\u3400-\\u9fff\\uff01-\\uff60';
  return raw
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(new RegExp(`([${cjk}]) +(?=[${cjk}])`, 'g'), '$1')
    .replace(new RegExp(`([${cjk}]) +(?=[0-9])`, 'g'), '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function recognizeBill(file: File, onProgress: (p: number, status: string) => void): Promise<string> {
  progressHandler = onProgress;
  try {
    onProgress(0, '写真を整えています');
    const canvas = await prepare(file);
    const worker = await getWorker();
    const { data } = await worker.recognize(canvas);
    return normalizeOcrText(data.text);
  } finally {
    progressHandler = null;
  }
}

export interface BillField {
  label: string;
  value: string;
}

/**
 * 電気明細でよく使う項目を、読み取ったテキストから拾う(見つかったものだけ)。
 * 明細の書式は電力会社ごとに違うため、あくまで候補。必ず元のテキストと見比べて使う。
 */
export function extractBillFields(text: string): BillField[] {
  const flat = text.replace(/\n/g, ' ');
  const out: BillField[] = [];
  const add = (label: string, re: RegExp, fmt: (m: RegExpMatchArray) => string = (m) => m[1]) => {
    const m = flat.match(re);
    if (m) out.push({ label, value: fmt(m).trim() });
  };
  // 供給地点特定番号(22桁。区切りの空白・ハイフンが入ることがある)
  add('供給地点特定番号', /供給地点特定番号[^0-9]{0,10}((?:\d[\s-]?){21}\d)/, (m) => m[1].replace(/[\s-]/g, ''));
  add('お客さま番号', /お客(?:さま|様)番号[^0-9A-Za-z]{0,6}([0-9A-Za-z][0-9A-Za-z\s-]{4,24}[0-9A-Za-z])/, (m) => m[1].replace(/\s/g, ''));
  add('契約種別', /(?:ご?契約種別|契約メニュー|料金プラン|ご契約)[\s:：]*([^\s]{2,20}(?:電灯|電力|プラン|コース)[A-Za-zＡ-Ｚ]?)/);
  add('契約容量・電力', /(?:契約(?:容量|電力|アンペア)|ご契約[^0-9]{0,4})[\s:：]*(\d+(?:\.\d+)?\s*(?:kVA|kW|A|ｋＶＡ|ｋＷ))/i);
  // 読み取りで1文字崩れることがある(例: 使用和量)ので「使用」と「量」の間に1〜2文字を許す
  add('使用量', /(?:使用.{0,2}量|使用電力量)[^0-9]{0,8}([\d,.]+)\s*kWh/i, (m) => `${m[1]} kWh`);
  // 金額のカンマがピリオドに読まれることがあるので直す(電気料金に小数は無い)
  add('請求金額', /(?:請求.{0,3}金額|請求額|今月の(?:電気)?料金|お支払.{0,2}金額)[^0-9]{0,8}([\d,.]+)\s*円/, (m) => `${m[1].replace(/\./g, ',')} 円`);
  add('使用期間', /(\d{1,2}月\d{1,2}日\s*[~〜～-]\s*\d{1,2}月\d{1,2}日)/);
  add('検針日', /検針(?:日|月日)[\s:：]*((?:\d{4}年)?\d{1,2}月\d{1,2}日)/);
  // 契約電力会社(明細に社名が載っていることが多い)
  {
    const companies = ['東京電力', '関西電力', '中部電力', '九州電力', '東北電力', '北海道電力', '北陸電力', '中国電力', '四国電力', '沖縄電力', 'エネット', 'ENEOSでんき', '東京ガス', '大阪ガス', 'Looopでんき', 'auでんき'];
    const hit = companies.find((c) => flat.includes(c));
    if (hit) out.push({ label: '契約電力会社', value: hit });
  }
  add('力率', /力率[^0-9]{0,4}(\d{2,3})\s*%/, (m) => `${m[1]}%`);
  add('明細月', /((?:\d{4}年)?\d{1,2}月)分/);
  add('住所', /((?:東京都|北海道|(?:京都|大阪)府|[^\s]{2,3}県)[^\s]{2,30}\d[0-9\-－丁目番地号]*)/);
  add('電話番号', /(0\d{1,4}-\d{1,4}-\d{3,4})/);
  // 前後に数字・ハイフンが続くもの(お客さま番号の一部など)は郵便番号とみなさない
  add('郵便番号', /(?:〒\s*|(?<![\d-]))(\d{3}-\d{4})(?![\d-])/);
  return out;
}
