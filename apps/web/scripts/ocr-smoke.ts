// 明細読み取りの動作確認(手動実行用): npx tsx scripts/ocr-smoke.ts <画像>
// ブラウザと同じエンジン・日本語データで読み取り、整形と項目抽出の結果を表示する。
import { createWorker, OEM } from 'tesseract.js';
import { normalizeOcrText, extractBillFields } from '../src/lib/ocr';

const file = process.argv[2];
if (!file) throw new Error('画像のパスを指定してください');

const worker = await createWorker('jpn', OEM.LSTM_ONLY, { langPath: new URL('../public/ocr/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), gzip: true });
await worker.setParameters({ preserve_interword_spaces: '1' });
const { data } = await worker.recognize(file);
await worker.terminate();
const text = normalizeOcrText(data.text);
console.log('--- text ---');
console.log(text);
console.log('--- fields ---');
console.log(extractBillFields(text));
