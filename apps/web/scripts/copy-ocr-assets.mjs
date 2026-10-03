// 明細読み取り(ブラウザ内OCR・完全無料)に必要なファイルを public/ocr へコピーする。
// 外部CDNから読み込まず自サーバーから配るため(CSP・通信先を増やさない)。ビルド/開発の前に実行する。
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'public', 'ocr');
mkdirSync(out, { recursive: true });

const tesseractDir = dirname(require.resolve('tesseract.js/package.json'));
// tesseract.js-core は tesseract.js の依存なので、tesseract.js 基準で解決する
const coreDir = dirname(createRequire(join(tesseractDir, 'package.json')).resolve('tesseract.js-core/package.json'));
const jpnDir = dirname(require.resolve('@tesseract.js-data/jpn/package.json'));

const files = [
  [join(tesseractDir, 'dist', 'worker.min.js'), 'worker.min.js'],
  // 認識方式は LSTM のみを使う(SIMD対応端末は simd 版が自動で選ばれる)
  [join(coreDir, 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [join(coreDir, 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  // 日本語の学習データ(軽量・高精度版)
  [join(jpnDir, '4.0.0_best_int', 'jpn.traineddata.gz'), 'jpn.traineddata.gz'],
];

for (const [from, name] of files) {
  if (!existsSync(from)) throw new Error(`OCR用ファイルが見つかりません: ${from}`);
  copyFileSync(from, join(out, name));
}
console.log(`OCR assets copied to ${out}`);
