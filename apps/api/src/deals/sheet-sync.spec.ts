import { dateToStored, findHeaderRow, parseSheetDate, parseSheetUrl } from './sheet-sync';

describe('シートから更新', () => {
  it('URLから ID とシート(gid)を取り出す', () => {
    expect(parseSheetUrl('https://docs.google.com/spreadsheets/d/1WckWFnjLxNSJdTN88o9m4YttegXJGHwzfMXRXHBPRt0/edit?gid=1410776038#gid=1410776038')).toEqual({
      spreadsheetId: '1WckWFnjLxNSJdTN88o9m4YttegXJGHwzfMXRXHBPRt0',
      gid: 1410776038,
    });
    expect(parseSheetUrl('https://example.com')).toBeNull();
  });

  it('シートの日付表記を読む', () => {
    const now = new Date('2026-10-05T00:00:00Z');
    expect(parseSheetDate('2026/10/1', now)).toBe('2026-10-01');
    expect(parseSheetDate('2026-10-01 12:30', now)).toBe('2026-10-01');
    expect(parseSheetDate('2026年10月1日', now)).toBe('2026-10-01');
    expect(parseSheetDate('10/3', now)).toBe('2026-10-03');
    expect(parseSheetDate('２０２６／１０／０１', now)).toBe('2026-10-01');
    expect(parseSheetDate('2026/2/30', now)).toBeNull();
    expect(parseSheetDate('未定', now)).toBeNull();
  });

  it('日付は一括投入(画面)と同じく日本時間の0時で保存', () => {
    expect(dateToStored('2026-10-01')).toBe('2026-09-30T15:00:00.000Z');
  });

  it('先頭に空行やタイトル行があっても見出し行を見つける', () => {
    const table = [[''], ['CSV貼り付け用'], ['店舗名', '申込番号', '進捗'], ['A店', '1', '済']];
    expect(findHeaderRow(table, ['店舗名', '申込番号'])).toBe(2);
  });
});
