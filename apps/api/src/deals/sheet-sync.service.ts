import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from '../integrations/google-calendar/google-calendar.service';
import { DealsService } from './deals.service';
import { dateToStored, findHeaderRow, parseSheetDate, parseSheetUrl } from './sheet-sync';

const SETTING_KEY = 'dealSheetSync';

export interface SheetSyncConfig {
  url: string;
  /** シートの列名 → 案件管理の項目(fieldKey)。取り込まない列は含めない */
  mapping: Record<string, string>;
}

export interface SheetSyncResult {
  at: string;
  by: string;
  created: number;
  updated: number;
  protectedFields: number;
  duplicates: number;
  skippedUsers: string[];
}

@Injectable()
export class DealSheetSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleCalendarService,
    private readonly deals: DealsService,
  ) {}

  async getConfig(): Promise<SheetSyncConfig & { lastResult: SheetSyncResult | null }> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    const v = (row?.value ?? {}) as Partial<SheetSyncConfig & { lastResult: SheetSyncResult }>;
    return { url: v.url ?? '', mapping: v.mapping ?? {}, lastResult: v.lastResult ?? null };
  }

  private async save(patch: Partial<SheetSyncConfig & { lastResult: SheetSyncResult }>) {
    const cur = await this.getConfig();
    const value = { ...cur, ...patch } as unknown as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({ where: { key: SETTING_KEY }, update: { value }, create: { key: SETTING_KEY, value } });
  }

  async saveConfig(cfg: SheetSyncConfig) {
    if (!parseSheetUrl(cfg.url)) throw new BadRequestException('GoogleスプレッドシートのURLを入力してください');
    await this.save({ url: cfg.url.trim(), mapping: cfg.mapping });
    return this.getConfig();
  }

  private async readTable(url: string) {
    const ref = parseSheetUrl(url);
    if (!ref) throw new BadRequestException('シートのURLが設定されていません');
    return this.google.readSheet(ref.spreadsheetId, ref.gid);
  }

  /** 見出し(列名)とデータ件数。列の対応づけ画面で使う */
  async headers(url: string) {
    const cfg = await this.getConfig();
    const table = await this.readTable(url || cfg.url);
    const h = findHeaderRow(table, Object.keys(cfg.mapping));
    return { headers: (table[h] ?? []).map((c) => c.trim()).filter(Boolean), rows: Math.max(0, table.length - h - 1) };
  }

  /** シートを読んで案件へ反映する(一括投入と同じ決まり) */
  async run(userId: string, userName: string): Promise<SheetSyncResult> {
    const cfg = await this.getConfig();
    const mappedHeaders = Object.keys(cfg.mapping).filter((h) => cfg.mapping[h]);
    if (!cfg.url || mappedHeaders.length === 0) throw new BadRequestException('先に「シート連携の設定」でシートと取り込む列を設定してください');
    const table = await this.readTable(cfg.url);
    const hi = findHeaderRow(table, mappedHeaders);
    const header = (table[hi] ?? []).map((c) => c.trim());
    const colOf = new Map(mappedHeaders.map((h) => [h, header.indexOf(h)] as const).filter(([, i]) => i >= 0));
    if (colOf.size === 0) throw new BadRequestException('シートに設定した列が見つかりません。列名が変わっていないか確認してください');

    const [fields, users, existing] = await Promise.all([
      this.deals.listFields(false),
      this.prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
      this.prisma.deal.findMany({ where: { deletedAt: null }, select: { id: true, values: true } }),
    ]);
    const fieldByKey = new Map(fields.map((f) => [f.fieldKey, f]));
    const nameKey = fields.find((f) => f.label === '案件名')?.fieldKey;
    const appNoKey = fields.find((f) => f.label === '申込番号')?.fieldKey;
    const norm = (v: unknown) => (v == null ? '' : String(v).trim());
    const optionCache = new Map(fields.map((f) => [f.id, [...f.options]]));
    const skippedUsers = new Set<string>();

    const rows: { values: Record<string, unknown> }[] = [];
    const updates: { id: string; values: Record<string, unknown> }[] = [];
    const updatedIds = new Set<string>();
    const batch: Record<string, unknown>[] = [];
    let duplicates = 0;
    const sameRecord = (a: Record<string, unknown>, b: Record<string, unknown>) => {
      const keys = Object.keys(a);
      return keys.length > 0 && keys.every((k) => norm(a[k]) === norm(b[k]));
    };

    for (const line of table.slice(hi + 1)) {
      const values: Record<string, unknown> = {};
      for (const [h, idx] of colOf) {
        const raw = (line[idx] ?? '').trim();
        const field = fieldByKey.get(cfg.mapping[h]);
        if (!raw || !field) continue;
        if (field.dataType === 'DATE') {
          const ymd = parseSheetDate(raw);
          if (ymd) values[field.fieldKey] = dateToStored(ymd);
        } else if (field.dataType === 'USER') {
          const u = users.find((x) => x.name.trim() === raw);
          if (u) values[field.fieldKey] = u.id;
          else skippedUsers.add(raw);
        } else if (field.dataType === 'SELECT') {
          const opts = optionCache.get(field.id) ?? [];
          let opt = opts.find((o) => o.label === raw);
          if (!opt) {
            // 一致する選択肢が無ければ追加する(データを失わないため。一括投入と同じ)
            opt = await this.deals.createOption(field.id, { label: raw });
            optionCache.set(field.id, [...opts, opt]);
          }
          values[field.fieldKey] = opt.id;
        } else {
          values[field.fieldKey] = raw;
        }
      }
      if (Object.keys(values).length === 0) continue;

      // 案件名+申込番号が一致する案件へは追記(手打ちの値は上書きしない。判定は bulkCreate 内)
      if (nameKey && appNoKey && norm(values[appNoKey])) {
        const target = existing.find((d) => {
          const v = (d.values ?? {}) as Record<string, unknown>;
          return norm(v[nameKey]) === norm(values[nameKey]) && norm(v[appNoKey]) === norm(values[appNoKey]);
        });
        if (target) {
          if (updatedIds.has(target.id)) duplicates++;
          else {
            updatedIds.add(target.id);
            updates.push({ id: target.id, values });
          }
          continue;
        }
        if (batch.some((b) => norm(b[nameKey]) === norm(values[nameKey]) && norm(b[appNoKey]) === norm(values[appNoKey]))) {
          duplicates++;
          continue;
        }
      } else if (existing.some((d) => sameRecord(values, (d.values ?? {}) as Record<string, unknown>)) || batch.some((b) => sameRecord(values, b))) {
        duplicates++;
        continue;
      }
      batch.push(values);
      rows.push({ values });
    }

    const res = await this.deals.bulkCreate(rows, userId, updates);
    const result: SheetSyncResult = {
      at: new Date().toISOString(),
      by: userName,
      created: res.count,
      updated: res.updated,
      protectedFields: res.protectedFields,
      duplicates,
      skippedUsers: [...skippedUsers],
    };
    await this.save({ lastResult: result });
    return result;
  }
}
