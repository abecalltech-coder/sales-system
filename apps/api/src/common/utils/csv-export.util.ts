import { Response } from 'express';
import { stringify } from 'csv-stringify';

interface StreamCsvExportOptions<T> {
  res: Response;
  filenamePrefix: string;
  columns: string[];
  /** 1行分のレコードをCSVの列名→値のオブジェクトへ変換する */
  mapRow: (row: T) => Record<string, string | number>;
  getId: (row: T) => string;
  batchSize?: number;
}

/**
 * 一覧データを全件メモリに載せず、カーソルベースでバッチ取得しながらCSVへストリーム出力する
 * 共通処理(セクション31: 一覧データを全件取得してはならない)。
 *
 * fetchBatchを第1引数(オブジェクトの外)に取ることで、TypeScriptの型推論がfetchBatchの
 * 戻り値から確実にTを決定できるようにしている(オブジェクトリテラル内で複数のコールバックに
 * Tが分散すると推論が安定しないため)。
 */
export async function streamCsvExport<T>(
  fetchBatch: (cursor: string | undefined, batchSize: number) => Promise<T[]>,
  options: StreamCsvExportOptions<T>,
): Promise<void> {
  const { res, filenamePrefix, columns, mapRow, getId, batchSize = 1000 } = options;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filenamePrefix}-${Date.now()}.csv"`);

  const stringifier = stringify({ header: true, columns });
  stringifier.pipe(res);

  let cursor: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await fetchBatch(cursor, batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      stringifier.write(mapRow(row));
    }
    cursor = getId(rows[rows.length - 1]);
    if (rows.length < batchSize) break;
  }

  stringifier.end();
}
