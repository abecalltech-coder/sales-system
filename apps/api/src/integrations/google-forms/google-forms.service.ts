import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/services/sequence.service';
import { StatusResolverService } from '../../common/services/status-resolver.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { SystemSettingsService } from '../../system-settings/system-settings.module';
import { GOOGLE_FORM_FIELD_MAP, matchGoogleFormField, reformatMemoBlob } from './google-forms-field-map';
import { GoogleFormWebhookDto } from './dto/google-form-webhook.dto';

const FORM_URL_KEY = 'googleFormUrl';
const WEBHOOK_SECRET_KEY = 'googleFormWebhookSecret';

@Injectable()
export class GoogleFormsService {
  private readonly logger = new Logger(GoogleFormsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly statusResolver: StatusResolverService,
    private readonly realtime: RealtimeService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  async getConfig() {
    const [formUrlValue, secret] = await Promise.all([this.systemSettings.getOne(FORM_URL_KEY), this.ensureSecret()]);
    return {
      formUrl: typeof formUrlValue === 'string' ? formUrlValue : '',
      webhookSecret: secret,
      fieldNames: GOOGLE_FORM_FIELD_MAP.flatMap((entry) => entry.aliases),
    };
  }

  async setFormUrl(formUrl: string) {
    await this.systemSettings.set(FORM_URL_KEY, formUrl);
    return this.getConfig();
  }

  async regenerateSecret() {
    const secret = randomBytes(24).toString('hex');
    await this.systemSettings.set(WEBHOOK_SECRET_KEY, secret);
    return secret;
  }

  private async ensureSecret(): Promise<string> {
    const existing = await this.systemSettings.getOne(WEBHOOK_SECRET_KEY);
    if (typeof existing === 'string' && existing) return existing;
    return this.regenerateSecret();
  }

  async listLogs(limit = 30) {
    return this.prisma.googleFormWebhookLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }

  async handleWebhook(providedSecret: string | undefined, dto: GoogleFormWebhookDto) {
    const expectedSecret = await this.ensureSecret();
    if (!providedSecret || providedSecret !== expectedSecret) {
      throw new UnauthorizedException('Webhookシークレットが一致しません');
    }

    // 冪等性チェック: 同じresponseIdが既に正常処理済みなら何もせず200を返す(Google/Apps Script側のリトライ対策)。
    if (dto.responseId) {
      const alreadyProcessed = await this.prisma.googleFormWebhookLog.findFirst({
        where: { responseId: dto.responseId, status: 'PROCESSED' },
      });
      if (alreadyProcessed) {
        return { ok: true, duplicate: true, tossCaseId: alreadyProcessed.tossCaseId };
      }
    }

    const log = await this.prisma.googleFormWebhookLog.create({
      data: {
        responseId: dto.responseId,
        rawPayload: (dto.answers ?? {}) as Prisma.InputJsonValue,
        status: 'RECEIVED',
      },
    });

    try {
      const tossCase = await this.createTossCaseFromAnswers(dto.answers ?? {});
      await this.prisma.googleFormWebhookLog.update({
        where: { id: log.id },
        data: { status: 'PROCESSED', tossCaseId: tossCase.id },
      });
      return { ok: true, tossCaseId: tossCase.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Googleフォーム回答の取り込みに失敗しました: ${message}`);
      await this.prisma.googleFormWebhookLog.update({
        where: { id: log.id },
        data: { status: 'ERROR', errorMessage: message },
      });
      // Google Apps Script側の再送を防ぐため、取り込み失敗でも200系として返す(受信原文はログに保存済み)。
      return { ok: false, error: message };
    }
  }

  private async createTossCaseFromAnswers(answers: Record<string, string>) {
    const customerFields: Record<string, string> = {};
    const tossTextFields: Record<string, string> = {};
    const statusLookups: { field: string; category: string; label: string }[] = [];
    let memo: string | undefined;
    let nextActionAt: Date | undefined;

    for (const [rawLabel, rawValue] of Object.entries(answers)) {
      const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
      if (!value) continue;
      const entry = matchGoogleFormField(rawLabel);
      if (!entry) continue;

      if (entry.kind === 'CUSTOMER_TEXT') {
        customerFields[entry.field] = value;
      } else if (entry.kind === 'TOSS_TEXT') {
        tossTextFields[entry.field] = value;
      } else if (entry.kind === 'STATUS_LOOKUP' && entry.statusCategory) {
        statusLookups.push({ field: entry.field, category: entry.statusCategory, label: value });
      } else if (entry.kind === 'DATE') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) nextActionAt = parsed;
      } else if (entry.kind === 'MEMO_BLOB') {
        memo = reformatMemoBlob(value);
      }
    }

    const resolvedStatusFields: Record<string, string> = {};
    for (const lookup of statusLookups) {
      const status = await this.prisma.statusMaster.findFirst({
        where: { category: lookup.category, displayName: lookup.label, active: true },
      });
      if (status) resolvedStatusFields[lookup.field] = status.id;
    }

    const customerId = await this.resolveCustomerId(customerFields);
    const statusId = await this.statusResolver.resolveId('TOSS', 'TOSS_NEW');
    // トスの状況管理は進捗に一本化。フォーム流入は「新規」で入れる。
    const progressStatusId = await this.statusResolver
      .resolveId('TOSS_PROGRESS', 'PROGRESS_NEW')
      .catch(() => undefined);
    const caseNumber = await this.sequence.nextCaseNumber('TOSS');

    const tossCase = await this.prisma.tossCase.create({
      data: {
        caseNumber,
        caseName: tossTextFields.caseName ?? customerFields.corporateName,
        customerId,
        statusId,
        progressStatusId,
        apStaffName: tossTextFields.apStaffName,
        proposal: tossTextFields.proposal,
        listName: tossTextFields.listName,
        callDirection: tossTextFields.callDirection,
        industry: tossTextFields.industry,
        hook: tossTextFields.hook,
        existingContract: tossTextFields.existingContract,
        memo,
        department: tossTextFields.department,
        preConfirmStatusId: resolvedStatusFields.preConfirmStatusId,
        nextActionAt,
      },
    });

    this.realtime.emitCaseUpdated(['company:default'], {
      entityType: 'TOSS_CASE',
      id: tossCase.id,
      version: tossCase.version,
      updatedAt: tossCase.updatedAt.toISOString(),
      action: 'created',
    });

    return tossCase;
  }

  /** 電話番号(数字のみ比較)→店舗名の順で既存顧客を検索し、見つかれば紐付ける。無ければ新規作成する。 */
  private async resolveCustomerId(customerFields: Record<string, string>): Promise<string | undefined> {
    if (!Object.keys(customerFields).length) return undefined;

    if (customerFields.phone) {
      const digits = customerFields.phone.replace(/\D/g, '');
      if (digits.length >= 8) {
        // 保存済みの電話番号はハイフンの有無が揃っていないため、数字のみに正規化して比較する
        // (contains検索だとハイフン位置の違いで一致しないため、DB側で正規化してから比較する)。
        const matches = await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Customer"
          WHERE "deletedAt" IS NULL AND regexp_replace(phone, '\D', '', 'g') = ${digits}
          LIMIT 1
        `;
        if (matches[0]) return matches[0].id;
      }
    }

    if (customerFields.corporateName) {
      const match = await this.prisma.customer.findFirst({
        where: { deletedAt: null, corporateName: customerFields.corporateName },
      });
      if (match) return match.id;
    }

    const customer = await this.prisma.customer.create({ data: { ...customerFields } });
    return customer.id;
  }
}
