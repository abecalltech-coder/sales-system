import { Response } from 'express';
import { stringify } from 'csv-stringify';

interface StreamCsvExportParams<T> {
  res: Response;
  filenamePrefix: string;
  columns: string[];
  /** カーソル(idの昇順)でバッチ取得する関数。cursorはこのバッチの最後のidを渡す。 */
  fetchBatch: (cursor: string | undefined, batchSize: number) => Promise<T[]>;
  /** 1行分のレコードをCSVの列名→値のオブジェクトへ変換する */
  mapRow: (row: T) => Record<string, string | number>;
  getId: (row: T) => string;
  batchSize?: number;
}

/**
 * 一覧データを全件メモリに載せず、カーソルベースでバッチ取得しながらCSVへストリーム出力する
 * 共通処理(セクション31: 一覧データを全件取得してはならない)。
 */
export async function streamCsvExport<T>(params: StreamCsvExportParams<T>): Promise<void> {
  const { res, filenamePrefix, columns, fetchBatch, mapRow, getId, batchSize = 1000 } = params;

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
