/**
 * Excel/Googleスプレッドシートからコピーした表(タブ区切り)を2次元配列に分解する。
 * セルの中に改行やタブを含む場合、Excel/スプレッドシートはそのセルを "..." で囲んで
 * 書き出す(ダブルクォートは "" でエスケープ)ため、素朴に改行やタブだけで分割すると
 * セル内の改行を行区切りと誤認して行がバラバラに壊れてしまう(要望: 一括投入で複数行の
 * 備考を含むデータが正しく取り込めない不具合の修正)。クォート状態を追跡しながら1文字ずつ
 * 読み進めることで、クォート内の改行・タブはセルの値としてそのまま扱う。
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    // フィールドの先頭にある " だけをクォート開始として扱う(セル途中の " は通常の文字)
    if (c === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === '\t') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += 1;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  // 末尾に改行が無い最終行も取りこぼさない
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 完全な空行(見出し貼り付け時の末尾の余分な改行等)は除外する
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}
