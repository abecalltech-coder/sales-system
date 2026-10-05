import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { SUMMARY_COLUMNS } from '../monthly-summary/aggregation.constants';
import { SHIFT_ATTRIBUTE_DEFS } from '../monthly-shift/monthly-shift.service';
import { FIELD_LABELS, OP_LABELS } from './audit-labels';

/**
 * 操作ログ(要望: どのタブで・何を・何から何に変えたかを細かく残す)。
 * 更新系リクエスト(POST/PUT/PATCH/DELETE)を横断的に捕まえ、処理前のレコードを読んでおき、
 * 成功/失敗が確定した時点で「タブ・操作・対象・項目ごとの変更前→変更後」をAuditLogへ書く。
 *
 * AuditLog.after に以下の形で保存する(表示は操作ログ画面が整形):
 *   { page, op, target, changes: [{ label, before, after }], count? }
 * 値はログ作成時点の表示名に解決済み(ステータスID→表示名、ユーザーID→氏名、日時→JST)。
 */

type Rec = Record<string, unknown>;
interface Change {
  label: string;
  before?: string;
  after: string;
}

/** 処理前のレコードを読むためのルート→Prismaモデル対応。:id で1件取得する。 */
const SINGLE_TARGETS: { pattern: RegExp; model: string; include?: Rec }[] = [
  { pattern: /^\/toss-cases\/[^/]+(\/calling-flag)?$/, model: 'tossCase', include: { customer: true } },
  { pattern: /^\/appointments\/[^/]+(\/retry-calendar)?$/, model: 'appointment', include: { customer: true } },
  { pattern: /^\/contracts\/[^/]+$/, model: 'contract', include: { appointment: { include: { customer: true } } } },
  { pattern: /^\/deals\/fields\/[^/]+(\/options)?$/, model: 'dealField' },
  { pattern: /^\/deals\/field-options\/[^/]+$/, model: 'dealFieldOption' },
  { pattern: /^\/deals\/[^/]+$/, model: 'deal' },
  { pattern: /^\/monthly-summary\/rows\/[^/]+$/, model: 'monthlySummaryRow' },
  { pattern: /^\/monthly-shift\/rows\/[^/]+$/, model: 'monthlyShiftRow' },
  { pattern: /^\/users\/[^/]+(\/reset-password|\/set-password)?$/, model: 'user' },
  { pattern: /^\/roles\/[^/]+$/, model: 'role' },
  { pattern: /^\/organizations\/departments\/[^/]+$/, model: 'department' },
  { pattern: /^\/organizations\/teams\/[^/]+$/, model: 'team' },
  { pattern: /^\/status-master\/[^/]+$/, model: 'statusMaster' },
  { pattern: /^\/custom-fields\/[^/]+$/, model: 'customFieldDefinition' },
  { pattern: /^\/toss-form\/fields\/[^/]+$/, model: 'tossFormField' },
  { pattern: /^\/final-reports\/admin\/fields\/[^/]+$/, model: 'finalReportField' },
  { pattern: /^\/automation-rules\/[^/]+$/, model: 'statusAutomationRule' },
  { pattern: /^\/custom-reports\/[^/]+$/, model: 'customReport' },
  { pattern: /^\/summary-sheets\/[^/]+(\/.*)?$/, model: 'summarySheet' },
  { pattern: /^\/visits\/[^/]+(\/.*)?$/, model: 'visit' },
  { pattern: /^\/integrations\/google-calendar\/appointments\/[^/]+\/create-meet$/, model: 'appointment', include: { customer: true } },
];

/** 一括操作(body.ids)の対象モデル */
const BULK_MODELS: Record<string, { model: string; include?: Rec }> = {
  'toss-cases': { model: 'tossCase', include: { customer: true } },
  appointments: { model: 'appointment', include: { customer: true } },
  contracts: { model: 'contract', include: { appointment: { include: { customer: true } } } },
  deals: { model: 'deal' },
  'monthly-summary': { model: 'monthlySummaryRow' },
  'monthly-shift': { model: 'monthlyShiftRow' },
};

/** ログを残さないルート(ログイン系は認証処理側で記録済み、個人設定や集計プレビューは操作ではないため) */
const SKIP = [
  /^\/auth\//,
  /^\/me\/preferences/,
  /^\/push\//,
  /^\/custom-reports\/preview$/,
  /^\/integrations\/google-forms\/webhook$/,
  /\/period-move$/, // 各サービスで移動前の対象月つきで記録済み
  /^\/chat\//, // チャットの発言は操作ログに残さない(会話の内容・写真を複製しないため)
  /^\/me\/profile/,
  /^\/memos/, // メモは自分専用の内容のため操作ログに残さない
  /^\/audit-logs\/copy$/, // コピーの記録はそのエンドポイント自身が書く
  /^\/application-sheets\/[^/]+\/photos$/, // 写真データそのものは操作ログに複製しない
];

/** DTOの「部分更新」キー → レコード側のJSON列 */
const PATCH_ALIASES: Record<string, string> = { valuesPatch: 'values', attributesPatch: 'attributes', daysPatch: 'days' };
const CUSTOMER_KEYS = ['corporateName', 'contactName', 'phone', 'email', 'address', 'postalCode', 'building'];
const IGNORE_KEYS = new Set(['version', 'ids', 'id']);
const SENSITIVE = /password|secret|token/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const MAX_VALUE_LEN = 300;
const MAX_BULK_TARGETS = 50;

const isPlainObject = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditTrailInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0].replace(/^\/api/, '');
    // 更新系に加えて、CSV出力(GET .../export)も記録する(要望: 情報の持ち出し確認)
    const isExport = method === 'GET' && /\/export$/.test(path);
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !isExport) return next.handle();
    const userId: string | undefined = req.user?.id;
    if (!userId || SKIP.some((re) => re.test(path))) return next.handle();

    const body: Rec = isPlainObject(req.body) ? req.body : {};
    const pageHeader = req.headers?.['x-page-path'];
    const page = typeof pageHeader === 'string' ? decodeURIComponent(pageHeader).slice(0, 200) : null;
    const ip: string | undefined = req.ip;

    // 処理前の状態は失敗しても本処理を止めない(ログ用の補助情報のため)
    let before: Rec | null = null;
    let bulkBefore: Rec[] = [];
    let beforeExtra: unknown = undefined;
    try {
      before = await this.loadBefore(path);
      bulkBefore = await this.loadBulkBefore(path, body);
      beforeExtra = await this.loadSpecialBefore(path, body, req.user);
    } catch (e) {
      this.logger.warn(`操作ログ: 変更前の取得に失敗 ${method} ${path}: ${e instanceof Error ? e.message : e}`);
    }

    const write = (success: boolean, errorMessage?: string, result?: unknown) => {
      this.buildAndWrite({ method, path, page, body, before, bulkBefore, beforeExtra, result, userId, ip, success, errorMessage }).catch(
        (e) => this.logger.warn(`操作ログの記録に失敗 ${method} ${path}: ${e instanceof Error ? e.message : e}`),
      );
    };

    return next.handle().pipe(
      tap({
        next: (result) => write(true, undefined, result),
        error: (err) => write(false, err?.response?.message ?? err?.message ?? 'エラー'),
      }),
    );
  }

  // ---------------------------------------------------------------- 変更前の取得

  private async loadBefore(path: string): Promise<Rec | null> {
    const def = SINGLE_TARGETS.find((t) => t.pattern.test(path));
    if (!def) return null;
    const segs = path.split('/').filter(Boolean);
    // モデルのIDは「最後の固定セグメントの直後」。例: /deals/fields/:id/options → :id
    const id = segs.find((s) => UUID.test(s));
    if (!id) return null;
    const delegate = (this.prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<Rec | null> }>)[def.model];
    return delegate.findUnique({ where: { id }, ...(def.include ? { include: def.include } : {}) });
  }

  private async loadBulkBefore(path: string, body: Rec): Promise<Rec[]> {
    if (!Array.isArray(body.ids) || body.ids.length === 0) return [];
    const base = path.split('/').filter(Boolean)[0];
    const def = BULK_MODELS[base];
    if (!def) return [];
    const ids = (body.ids as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, MAX_BULK_TARGETS);
    const delegate = (this.prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<Rec[]> }>)[def.model];
    return delegate.findMany({ where: { id: { in: ids } }, ...(def.include ? { include: def.include } : {}) });
  }

  /** IDがURLに無いがDB上の既存値と比較したい操作(セル入力・カスタム項目の値・最終報告) */
  private async loadSpecialBefore(path: string, body: Rec, user: { id: string } | undefined): Promise<unknown> {
    const cell = path.match(/^\/summary-sheets\/([^/]+)\/cells$/);
    if (cell && typeof body.row === 'number' && typeof body.col === 'number') {
      const c = await this.prisma.summarySheetCell.findUnique({
        where: { sheetId_row_col: { sheetId: cell[1], row: body.row, col: body.col } },
      });
      return c?.value ?? null;
    }
    if (path === '/custom-fields/values' && typeof body.fieldId === 'string' && typeof body.entityId === 'string') {
      const v = await this.prisma.customFieldValue.findUnique({
        where: { fieldId_entityId: { fieldId: body.fieldId, entityId: body.entityId } },
      });
      if (!v) return null;
      return v.textValue ?? v.numberValue?.toString() ?? v.dateTimeValue ?? v.dateValue ?? v.booleanValue ?? v.jsonValue ?? null;
    }
    if (path === '/final-reports/entries' && typeof body.date === 'string') {
      const targetUserId = typeof body.userId === 'string' ? body.userId : user?.id;
      if (!targetUserId) return null;
      const e = await this.prisma.finalReportEntry.findUnique({ where: { userId_date: { userId: targetUserId, date: body.date } } });
      return e?.values ?? null;
    }
    return undefined;
  }

  // ---------------------------------------------------------------- ログ組み立て

  private async buildAndWrite(p: {
    method: string;
    path: string;
    page: string | null;
    body: Rec;
    before: Rec | null;
    bulkBefore: Rec[];
    beforeExtra: unknown;
    result: unknown;
    userId: string;
    ip?: string;
    success: boolean;
    errorMessage?: string;
  }) {
    const segs = p.path.split('/').filter(Boolean);
    const resource = segs[0] ?? '';
    const op = this.resolveOp(p.method, segs);
    const resolver = await this.createResolver(p);

    let target: string | null = p.before ? await this.describeRecord(p.before, resolver) : null;
    let changes: Change[] = [];
    let count: number | undefined;

    if (/\/calling-flag$/.test(p.path)) {
      changes = [{ label: '対応中', before: resolver.fmt(p.before?.isCallingInProgress), after: resolver.fmt(p.body.active) }];
    } else if (/\/cells$/.test(p.path) && p.before) {
      const cellName = `${colName(Number(p.body.col))}${Number(p.body.row) + 1}`;
      changes = [{ label: `セル ${cellName}`, before: resolver.fmt(p.beforeExtra), after: resolver.fmt(p.body.value) }];
    } else if (p.path === '/custom-fields/values') {
      const def = await this.prisma.customFieldDefinition.findUnique({ where: { id: String(p.body.fieldId) } });
      target = await this.describeEntity(String(p.body.entityType), String(p.body.entityId), resolver);
      changes = [{ label: def?.label ?? 'カスタム項目', before: resolver.fmt(p.beforeExtra), after: resolver.fmt(p.body.value) }];
    } else if (p.path === '/final-reports/entries') {
      const targetUserId = typeof p.body.userId === 'string' ? p.body.userId : p.userId;
      target = `${resolver.name(targetUserId) ?? ''} ${String(p.body.date ?? '')}`.trim();
      const prev = isPlainObject(p.beforeExtra) ? p.beforeExtra : {};
      changes = Object.entries(isPlainObject(p.body.valuesPatch) ? p.body.valuesPatch : {}).map(([k, v]) => ({
        label: resolver.name(k) ?? k,
        before: resolver.fmt(prev[k]),
        after: resolver.fmt(v),
      }));
    } else if (p.path === '/cell-styles') {
      const cells = Array.isArray(p.body.cells) ? p.body.cells.length : 0;
      count = cells;
      if ('bold' in p.body) changes.push({ label: '太字', after: p.body.bold ? 'ON' : 'OFF' });
      if ('textColor' in p.body) changes.push({ label: '文字色', after: resolver.fmt(p.body.textColor) });
      if ('backgroundColor' in p.body) changes.push({ label: '背景色', after: resolver.fmt(p.body.backgroundColor) });
    } else if (p.bulkBefore.length > 0 || Array.isArray(p.body.ids)) {
      const ids = Array.isArray(p.body.ids) ? p.body.ids : [];
      count = ids.length;
      const names = await Promise.all(p.bulkBefore.map((r) => this.describeRecord(r, resolver)));
      // 並び替えは全行のIDが送られてくるため対象名は並べない
      target = /reorder/.test(p.path)
        ? null
        : names.filter(Boolean).join('、') + (ids.length > p.bulkBefore.length ? ` ほか${ids.length - p.bulkBefore.length}件` : '');
      if (!/reorder|bulk-delete/.test(p.path)) {
        changes = this.diff(this.withoutIds(p.body), null, resource, resolver);
      }
    } else if (Array.isArray(p.body.rows)) {
      count = p.body.rows.length;
      const rows = (p.body.rows as unknown[]).filter(isPlainObject).slice(0, MAX_BULK_TARGETS);
      changes = rows.map((r, i) => ({
        label: `${i + 1}行目`,
        after: this.diff(r, null, resource, resolver)
          .map((c) => `${c.label}: ${c.after}`)
          .join(' / '),
      }));
    } else if (p.method !== 'DELETE') {
      changes = this.diff(p.body, p.before, resource, resolver);
    }

    // 作成系は作成されたレコードから対象名を取る
    if (!target && p.success && isPlainObject(p.result)) {
      const created = isPlainObject(p.result.user) ? p.result.user : p.result;
      if (typeof created.id === 'string' || typeof created.caseNumber === 'string') target = await this.describeRecord(created, resolver);
    }
    if (!target && p.method === 'DELETE' && p.before === null && segs.length > 1) target = segs.slice(1).join('/');

    await this.prisma.auditLog.create({
      data: {
        actorUserId: p.userId,
        action: `${resource}.${op.code}`,
        ipAddress: p.ip,
        targetType: resource,
        targetId: segs.find((s) => UUID.test(s)) ?? null,
        before: p.before ? (JSON.parse(JSON.stringify(this.sanitize(p.before))) as object) : undefined,
        after: {
          page: p.page,
          op: op.label,
          target: target || null,
          changes: changes.filter((c) => c.after !== undefined) as unknown as object[],
          ...(count !== undefined ? { count } : {}),
        },
        success: p.success,
        errorMessage: p.errorMessage ? String(Array.isArray(p.errorMessage) ? p.errorMessage.join(' / ') : p.errorMessage).slice(0, 500) : null,
      },
    });
  }

  private withoutIds(body: Rec): Rec {
    const { ids: _ids, ...rest } = body;
    return rest;
  }

  private resolveOp(method: string, segs: string[]): { code: string; label: string } {
    const last = segs[segs.length - 1] ?? '';
    if (method === 'GET' && last === 'export') return { code: 'export', label: 'CSV出力' };
    const hasId = segs.slice(1).some((s) => UUID.test(s));
    const key = !UUID.test(last) && (segs.length > 1 || last === 'cell-styles') ? last : '';
    if (method === 'DELETE') {
      const parent = segs[segs.length - 2];
      if (parent === 'rows') return { code: 'delete_row', label: '行削除' };
      if (parent === 'columns') return { code: 'delete_column', label: '列削除' };
      return { code: 'delete', label: '削除' };
    }
    if (key && OP_LABELS[key]) return { code: key, label: OP_LABELS[key] };
    if (method === 'PATCH' || (method === 'PUT' && hasId)) return { code: 'update', label: '更新' };
    if (method === 'PUT') return { code: 'save', label: '設定変更' };
    return { code: 'create', label: '新規作成' };
  }

  /** 項目ごとの変更前→変更後。before が無ければ入力内容の一覧になる */
  private diff(body: Rec, before: Rec | null, resource: string, r: Resolver): Change[] {
    const out: Change[] = [];
    for (const [rawKey, value] of Object.entries(body)) {
      if (IGNORE_KEYS.has(rawKey)) continue;
      const key = PATCH_ALIASES[rawKey] ?? rawKey;
      const prevSource = before
        ? key in before
          ? before[key]
          : CUSTOMER_KEYS.includes(key)
            ? this.customerOf(before)?.[key]
            : undefined
        : undefined;

      if (isPlainObject(value) && key !== 'config') {
        const prevObj = isPlainObject(prevSource) ? prevSource : {};
        for (const [sub, v] of Object.entries(value)) {
          const label = this.subLabel(resource, key, sub, r);
          this.pushChange(out, label, before ? prevObj[sub] : undefined, v, !!before, r, sub);
        }
        continue;
      }
      const label = FIELD_LABELS[key] ?? key;
      this.pushChange(out, label, prevSource, value, !!before, r, key);
    }
    return out;
  }

  private pushChange(out: Change[], label: string, prev: unknown, next: unknown, hasBefore: boolean, r: Resolver, key: string) {
    if (SENSITIVE.test(key)) {
      out.push({ label, after: '(非表示)' });
      return;
    }
    const after = r.fmt(next);
    if (!hasBefore) {
      if (after !== '(空)') out.push({ label, after });
      return;
    }
    const beforeStr = r.fmt(prev);
    if (beforeStr === after) return;
    out.push({ label, before: beforeStr, after });
  }

  private subLabel(resource: string, key: string, sub: string, r: Resolver): string {
    if (resource === 'monthly-summary') return SUMMARY_COLUMNS.find((c) => c.code === sub)?.label ?? sub;
    if (resource === 'monthly-shift') {
      if (key === 'days') return `${sub.replace(/^\d{4}-/, '').replace('-', '/')} 稼働時間`;
      return SHIFT_ATTRIBUTE_DEFS.find((d) => d.code === sub)?.label ?? sub;
    }
    if (resource === 'deals') return r.dealFieldLabel(sub) ?? sub;
    return FIELD_LABELS[sub] ?? sub;
  }

  private customerOf(rec: Rec): Rec | null {
    if (isPlainObject(rec.customer)) return rec.customer;
    if (isPlainObject(rec.appointment) && isPlainObject(rec.appointment.customer)) return rec.appointment.customer;
    return null;
  }

  /** 対象レコードを人が読める1行に(案件番号+店舗名、氏名、表示名など) */
  private async describeRecord(rec: Rec, r: Resolver): Promise<string | null> {
    const customer = this.customerOf(rec);
    if (typeof rec.caseNumber === 'string') {
      const name = rec.caseName ?? customer?.corporateName ?? '';
      return `${rec.caseNumber} ${name}`.trim();
    }
    for (const k of ['name', 'displayName', 'label']) if (typeof rec[k] === 'string' && rec[k]) return rec[k] as string;
    if (typeof rec.userId === 'string') return r.name(rec.userId) ?? null;
    if (isPlainObject(rec.values)) {
      const first = Object.values(rec.values).find((v) => typeof v === 'string' && v && !UUID.test(v));
      if (first) return String(first).slice(0, 40);
    }
    return null;
  }

  private async describeEntity(entityType: string, id: string, r: Resolver): Promise<string | null> {
    const model = { TOSS: 'tossCase', APPOINTMENT: 'appointment', CONTRACT: 'contract', ENTRY: 'contract' }[entityType];
    if (!model) return null;
    const delegate = (this.prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<Rec | null> }>)[model];
    const rec = await delegate.findUnique({ where: { id } });
    return rec ? this.describeRecord(rec, r) : null;
  }

  /** ログに出てくるUUIDをまとめて表示名へ解決する(ステータス・ユーザー・部署など) */
  private async createResolver(p: { path: string; userId: string; body: Rec; before: Rec | null; bulkBefore: Rec[]; beforeExtra: unknown }) {
    const ids = new Set<string>();
    const collect = (v: unknown, depth = 0) => {
      if (depth > 4 || v == null) return;
      if (typeof v === 'string') {
        if (UUID.test(v)) ids.add(v);
      } else if (Array.isArray(v)) v.forEach((x) => collect(x, depth + 1));
      else if (isPlainObject(v)) {
        for (const [k, x] of Object.entries(v)) {
          if (UUID.test(k)) ids.add(k); // 最終報告の valuesPatch は項目IDがキー
          collect(x, depth + 1);
        }
      }
    };
    collect(p.body);
    collect(p.before);
    collect(p.bulkBefore);
    collect(p.beforeExtra);
    ids.add(p.userId); // 最終報告で本人分を入力したときの対象者名
    const list = [...ids];
    const names = new Map<string, string>();
    const dealFields = new Map<string, string>();
    if (list.length > 0) {
      const where = { id: { in: list } };
      const [statuses, users, depts, teams, products, sources, options, reportFields] = await Promise.all([
        this.prisma.statusMaster.findMany({ where, select: { id: true, displayName: true } }),
        this.prisma.user.findMany({ where, select: { id: true, name: true } }),
        this.prisma.department.findMany({ where, select: { id: true, name: true } }),
        this.prisma.team.findMany({ where, select: { id: true, name: true } }),
        this.prisma.product.findMany({ where, select: { id: true, name: true } }),
        this.prisma.source.findMany({ where, select: { id: true, name: true } }),
        this.prisma.dealFieldOption.findMany({ where, select: { id: true, label: true } }),
        this.prisma.finalReportField.findMany({ where, select: { id: true, label: true } }),
      ]);
      statuses.forEach((s) => names.set(s.id, s.displayName));
      [...users, ...depts, ...teams, ...products, ...sources].forEach((x) => names.set(x.id, x.name));
      [...options, ...reportFields].forEach((x) => names.set(x.id, x.label));
    }
    if (p.path.startsWith('/deals')) {
      const fields = await this.prisma.dealField.findMany({ select: { fieldKey: true, label: true } });
      fields.forEach((f) => dealFields.set(f.fieldKey, f.label));
    }
    return new Resolver(names, dealFields);
  }

  private sanitize(rec: Rec): Rec {
    const out: Rec = {};
    for (const [k, v] of Object.entries(rec)) out[k] = SENSITIVE.test(k) ? '(非表示)' : v;
    return out;
  }
}

class Resolver {
  constructor(
    private readonly names: Map<string, string>,
    private readonly dealFields: Map<string, string>,
  ) {}

  name(id: string): string | undefined {
    return this.names.get(id);
  }

  dealFieldLabel(key: string): string | undefined {
    return this.dealFields.get(key);
  }

  /** 値を表示用の文字列へ(空→(空)、真偽→ON/OFF、日時→JST、ID→表示名) */
  fmt(v: unknown): string {
    if (v === null || v === undefined || v === '') return '(空)';
    if (typeof v === 'boolean') return v ? 'ON' : 'OFF';
    if (v instanceof Date) return formatJst(v);
    if (typeof v === 'string') {
      if (UUID.test(v)) return this.names.get(v) ?? v;
      if (ISO_DATETIME.test(v)) {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) return formatJst(d);
      }
      return v.length > MAX_VALUE_LEN ? `${v.slice(0, MAX_VALUE_LEN)}…` : v;
    }
    if (typeof v === 'number' || typeof v === 'bigint') return String(v);
    if (Array.isArray(v)) return v.length === 0 ? '(空)' : v.map((x) => this.fmt(x)).join('、');
    if (typeof (v as { toString?: unknown }).toString === 'function' && (v as object).constructor?.name === 'Decimal') return String(v);
    const json = JSON.stringify(v);
    return json.length > MAX_VALUE_LEN ? `${json.slice(0, MAX_VALUE_LEN)}…` : json;
  }
}

function formatJst(d: Date): string {
  const j = new Date(d.getTime() + 9 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${j.getUTCFullYear()}/${pad(j.getUTCMonth() + 1)}/${pad(j.getUTCDate())}`;
  const hm = `${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}`;
  return hm === '00:00' ? date : `${date} ${hm}`;
}

function colName(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
