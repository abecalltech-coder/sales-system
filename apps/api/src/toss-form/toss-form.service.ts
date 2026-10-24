import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TossCasesService } from '../toss-cases/toss-cases.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { isOnlineHook } from '../appointments/toss-appointment-automation.util';
import { CreateTossFormFieldDto, SubmitTossFormDto, UpdateTossFormFieldDto } from './dto/toss-form.dto';

// フォーム項目のマッピング先として許可するキー
const TARGET_KEYS = [
  'department',
  'hook',
  'tossUserName',
  'preConfirmStaffName',
  'corporateName',
  'phone',
  'address',
  'electricCompany',
  'contactName',
  'listName',
  'proposal',
  'callDirection',
  'industry',
  'preferredCallAt',
  'memo',
] as const;

// アポ登録フォーム(アポ詳細を単品で作る)の保存先
const APO_TARGET_KEYS = [
  'department',
  'hook',
  'apStaffName',
  'preConfirmStaffName',
  'closerName',
  'corporateName',
  'phone',
  'address',
  'contactName',
  'industry',
  'listName',
  'existingContract',
  'meetingStartAt',
  'preContactAt',
  'memo',
  'acquisitionAngle',
  'nextActionAt',
  'mobilePhone',
  'contactAge',
  'contactGender',
  'charge',
  'billPrep',
  'corporateType',
  'outOfScope',
  'pointsJuryo',
  'pointsDoryoku',
  'proposal',
  'smsTo',
  'storeHp',
  'nearestStation',
  'walkMinutes',
] as const;

/** 訪問(フックが HPZOOM 以外)のときだけ必須にする項目(要望) */
const VISIT_REQUIRED_KEYS = ['nearestStation', 'walkMinutes'];

/** TOSS=トス登録 / APPOINTMENT=アポ登録 */
export type FormKind = 'TOSS' | 'APPOINTMENT';
const targetKeysOf = (form: FormKind): readonly string[] => (form === 'APPOINTMENT' ? APO_TARGET_KEYS : TARGET_KEYS);

const FIELD_TYPES = ['TEXT', 'TEXTAREA', 'SELECT', 'MULTISELECT', 'RADIO', 'DATE', 'DATETIME'];
const OPTIONS_MODES = ['NONE', 'STATIC', 'MASTER', 'USERS'];

@Injectable()
export class TossFormService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tossCases: TossCasesService,
    private readonly appointments: AppointmentsService,
  ) {}

  /** フォーム項目一覧。includeInactive=false のとき有効なもののみ(アポインターのフォーム用) */
  async listFields(includeInactive = false, form: FormKind = 'TOSS') {
    const fields = await this.prisma.tossFormField.findMany({
      where: { form, ...(includeInactive ? {} : { active: true }) },
      orderBy: { order: 'asc' },
    });
    // MASTER / USERS の選択肢を解決して埋める
    const masterCats = [...new Set(fields.filter((f) => f.optionsMode === 'MASTER' && f.masterCategory).map((f) => f.masterCategory!))];
    const masters = masterCats.length
      ? await this.prisma.statusMaster.findMany({ where: { category: { in: masterCats }, active: true }, orderBy: { order: 'asc' } })
      : [];
    const needUsers = fields.some((f) => f.optionsMode === 'USERS');
    const users = needUsers
      ? await this.prisma.user.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, orderBy: { displayOrder: 'asc' }, select: { name: true } })
      : [];

    return fields.map((f) => ({
      id: f.id,
      targetKey: f.targetKey,
      label: f.label,
      fieldType: f.fieldType,
      required: f.required,
      active: f.active,
      order: f.order,
      helpText: f.helpText,
      optionsMode: f.optionsMode,
      masterCategory: f.masterCategory,
      staticOptions: (f.staticOptions as string[]) ?? [],
      options:
        f.optionsMode === 'STATIC'
          ? ((f.staticOptions as string[]) ?? [])
          : f.optionsMode === 'MASTER'
            ? masters.filter((m) => m.category === f.masterCategory).map((m) => m.displayName)
            : f.optionsMode === 'USERS'
              ? users.map((u) => u.name)
              : [],
    }));
  }

  private validateField(dto: CreateTossFormFieldDto | UpdateTossFormFieldDto, form: FormKind) {
    if (dto.targetKey !== undefined && !targetKeysOf(form).includes(dto.targetKey)) {
      throw new BadRequestException(`マッピング先(targetKey)が不正です: ${dto.targetKey}`);
    }
    if (dto.fieldType !== undefined && !FIELD_TYPES.includes(dto.fieldType)) {
      throw new BadRequestException(`項目タイプが不正です: ${dto.fieldType}`);
    }
    if (dto.optionsMode !== undefined && !OPTIONS_MODES.includes(dto.optionsMode)) {
      throw new BadRequestException(`選択肢モードが不正です: ${dto.optionsMode}`);
    }
  }

  async createField(dto: CreateTossFormFieldDto, form: FormKind = 'TOSS') {
    this.validateField(dto, form);
    const max = await this.prisma.tossFormField.aggregate({ where: { form }, _max: { order: true } });
    return this.prisma.tossFormField.create({
      data: {
        form,
        targetKey: dto.targetKey,
        label: dto.label,
        fieldType: dto.fieldType ?? 'TEXT',
        required: dto.required ?? false,
        active: dto.active ?? true,
        order: dto.order ?? (max._max.order ?? 0) + 10,
        helpText: dto.helpText,
        optionsMode: dto.optionsMode ?? 'NONE',
        masterCategory: dto.masterCategory,
        staticOptions: dto.staticOptions ?? [],
      },
    });
  }

  async updateField(id: string, dto: UpdateTossFormFieldDto, form: FormKind = 'TOSS') {
    this.validateField(dto, form);
    return this.prisma.tossFormField.update({
      where: { id, form },
      data: {
        ...(dto.targetKey !== undefined ? { targetKey: dto.targetKey } : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.fieldType !== undefined ? { fieldType: dto.fieldType } : {}),
        ...(dto.required !== undefined ? { required: dto.required } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.helpText !== undefined ? { helpText: dto.helpText } : {}),
        ...(dto.optionsMode !== undefined ? { optionsMode: dto.optionsMode } : {}),
        ...(dto.masterCategory !== undefined ? { masterCategory: dto.masterCategory } : {}),
        ...(dto.staticOptions !== undefined ? { staticOptions: dto.staticOptions } : {}),
      },
    });
  }

  async deleteField(id: string, form: FormKind = 'TOSS') {
    await this.prisma.tossFormField.delete({ where: { id, form } });
    return { ok: true };
  }

  /** 必須チェックをして、回答を文字列で取り出す関数を返す */
  private async readAnswers(form: FormKind, answers: SubmitTossFormDto['answers']) {
    const fields = await this.prisma.tossFormField.findMany({ where: { form, active: true } });
    for (const f of fields) {
      if (!f.required) continue;
      const v = answers[f.targetKey];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) throw new BadRequestException(`「${f.label}」は必須です`);
    }
    return (key: string): string | undefined => {
      const v = answers[key];
      if (v === undefined || v === null) return undefined;
      if (Array.isArray(v)) return v.filter(Boolean).join('・') || undefined;
      const s = String(v).trim();
      return s || undefined;
    };
  }

  /** アポ登録フォームから送信 → アポ詳細を単品で作る */
  async submitAppointment(dto: SubmitTossFormDto, actorUserId: string) {
    const val = await this.readAnswers('APPOINTMENT', dto.answers ?? {});
    if (!isOnlineHook(val('hook'))) {
      const visitFields = await this.prisma.tossFormField.findMany({
        where: { form: 'APPOINTMENT', active: true, targetKey: { in: VISIT_REQUIRED_KEYS } },
        orderBy: { order: 'asc' },
      });
      const missing = visitFields.find((f) => !val(f.targetKey));
      if (missing) throw new BadRequestException(`訪問のときは「${missing.label}」は必須です`);
    }
    const date = (key: string) => {
      const v = val(key);
      if (!v) return undefined;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('日時の形式が正しくありません');
      return d;
    };
    return this.appointments.createStandalone(
      {
        corporateName: val('corporateName'),
        phone: val('phone'),
        address: val('address'),
        contactName: val('contactName'),
        department: val('department'),
        hook: val('hook'),
        apStaffName: val('apStaffName'),
        preConfirmName: val('preConfirmStaffName'),
        closerName: val('closerName'),
        industry: val('industry'),
        listName: val('listName'),
        existingContract: val('existingContract'),
        meetingStartAt: date('meetingStartAt'),
        preContactAt: date('preContactAt'),
        memo: val('memo'),
        acquisitionAngle: val('acquisitionAngle'),
        nextActionAt: date('nextActionAt'),
        mobilePhone: val('mobilePhone'),
        contactAge: val('contactAge'),
        contactGender: val('contactGender'),
        charge: val('charge'),
        billPrep: val('billPrep'),
        corporateType: val('corporateType'),
        outOfScope: val('outOfScope'),
        pointsJuryo: val('pointsJuryo'),
        pointsDoryoku: val('pointsDoryoku'),
        proposal: val('proposal'),
        smsTo: val('smsTo'),
        storeHp: val('storeHp'),
        nearestStation: val('nearestStation'),
        walkMinutes: val('walkMinutes'),
      },
      actorUserId,
    );
  }

  /** アポインターがフォームから送信 → トス案件を作成する */
  async submit(dto: SubmitTossFormDto, actorUserId: string) {
    const val = await this.readAnswers('TOSS', dto.answers ?? {});

    // AP(旧「トス担当者名」) → tossUserId + トス実績の AP 欄(apStaffName)へ反映
    let tossUserId: string | undefined;
    const tossUserName = val('tossUserName');
    if (tossUserName) {
      const u = await this.prisma.user.findFirst({ where: { name: tossUserName, deletedAt: null }, select: { id: true } });
      tossUserId = u?.id;
    }
    // 前確担当者名 → preConfirmStatusId (TOSS_PRE_CONFIRM の表示名で照合)
    let preConfirmStatusId: string | undefined;
    const preName = val('preConfirmStaffName');
    if (preName) {
      const s = await this.prisma.statusMaster.findFirst({
        where: { category: 'TOSS_PRE_CONFIRM', displayName: preName },
        select: { id: true },
      });
      preConfirmStatusId = s?.id;
    }

    const preferredCallAt = val('preferredCallAt');

    return this.tossCases.create(
      {
        corporateName: val('corporateName'),
        contactName: val('contactName'),
        phone: val('phone'),
        address: val('address'),
        department: val('department'),
        hook: val('hook'),
        existingContract: val('electricCompany'),
        listName: val('listName'),
        proposal: val('proposal'),
        callDirection: val('callDirection'),
        industry: val('industry'),
        memo: val('memo'),
        nextActionAt: preferredCallAt ? new Date(preferredCallAt).toISOString() : undefined,
        ...(tossUserName ? { apStaffName: tossUserName } : {}),
        ...(tossUserId ? { tossUserId } : {}),
        ...(preConfirmStatusId ? { preConfirmStatusId } : {}),
      },
      actorUserId,
    );
  }
}
