import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomFieldDto, UpdateCustomFieldDto, SetCustomFieldValueDto } from './dto/custom-field.dto';

const DATE_TYPES = new Set(['DATE']);
const DATETIME_TYPES = new Set(['DATETIME', 'TIME']);
const NUMBER_TYPES = new Set(['INT', 'DECIMAL', 'CURRENCY']);
const BOOLEAN_TYPES = new Set(['CHECKBOX']);

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(entityType?: string) {
    return this.prisma.customFieldDefinition.findMany({
      where: { deletedAt: null, ...(entityType ? { entityType } : {}) },
      orderBy: [{ entityType: 'asc' }, { order: 'asc' }],
      include: { options: { orderBy: { order: 'asc' } } },
    });
  }

  async create(dto: CreateCustomFieldDto) {
    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: { entityType_fieldKey: { entityType: dto.entityType, fieldKey: dto.fieldKey } },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException('同じentityType/fieldKeyの項目が既に存在します');
    }
    if (existing && existing.deletedAt) {
      throw new ConflictException(
        '過去に使用されたfieldKeyは再利用できません(既存データとの整合性のため)。別のキーを指定してください。',
      );
    }

    return this.prisma.customFieldDefinition.create({
      data: {
        entityType: dto.entityType,
        fieldKey: dto.fieldKey,
        label: dto.label,
        description: dto.description,
        dataType: dto.dataType,
        required: dto.required ?? false,
        defaultValue: dto.defaultValue,
        placeholder: dto.placeholder,
        showInList: dto.showInList ?? false,
        showInDetail: dto.showInDetail ?? true,
        showInCreate: dto.showInCreate ?? true,
        showInEdit: dto.showInEdit ?? true,
        searchable: dto.searchable ?? false,
        filterable: dto.filterable ?? false,
        csvExportable: dto.csvExportable ?? true,
        csvImportable: dto.csvImportable ?? true,
        order: dto.order ?? 0,
        options: dto.options
          ? { create: dto.options.map((o, i) => ({ label: o.label, value: o.value, order: o.order ?? i })) }
          : undefined,
      },
      include: { options: true },
    });
  }

  async update(id: string, dto: UpdateCustomFieldDto) {
    const existing = await this.prisma.customFieldDefinition.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('カスタム項目が見つかりません');
    return this.prisma.customFieldDefinition.update({ where: { id }, data: dto });
  }

  /** 項目削除時も既存データを失わないよう論理削除する(セクション29) */
  async softDelete(id: string) {
    await this.prisma.customFieldDefinition.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    return { ok: true };
  }

  async getValues(entityType: string, entityId: string) {
    const values = await this.prisma.customFieldValue.findMany({
      where: { entityType, entityId },
      include: { field: true },
    });
    return values.map((v) => ({
      fieldId: v.fieldId,
      fieldKey: v.field.fieldKey,
      value: v.textValue ?? v.numberValue ?? v.dateValue ?? v.dateTimeValue ?? v.booleanValue ?? v.jsonValue ?? null,
    }));
  }

  /** データ型別に検索可能なカラムへ振り分けて保存する(単純なJSON列だけに頼らない、セクション29) */
  async setValue(dto: SetCustomFieldValueDto) {
    const field = await this.prisma.customFieldDefinition.findFirst({
      where: { id: dto.fieldId, deletedAt: null },
    });
    if (!field) throw new NotFoundException('カスタム項目定義が見つかりません');
    if (field.entityType !== dto.entityType) {
      throw new BadRequestException('entityTypeが項目定義と一致しません');
    }
    if (field.required && (dto.value === null || dto.value === undefined || dto.value === '')) {
      throw new BadRequestException(`${field.label}は必須項目です`);
    }

    const data: Record<string, unknown> = {
      textValue: null,
      numberValue: null,
      dateValue: null,
      dateTimeValue: null,
      booleanValue: null,
      jsonValue: null,
    };

    if (field.dataType === 'MULTISELECT') {
      data.jsonValue = dto.value;
    } else if (BOOLEAN_TYPES.has(field.dataType)) {
      data.booleanValue = Boolean(dto.value);
    } else if (NUMBER_TYPES.has(field.dataType)) {
      data.numberValue = dto.value === null ? null : Number(dto.value);
    } else if (DATE_TYPES.has(field.dataType)) {
      data.dateValue = dto.value ? new Date(String(dto.value)) : null;
    } else if (DATETIME_TYPES.has(field.dataType)) {
      data.dateTimeValue = dto.value ? new Date(String(dto.value)) : null;
    } else {
      data.textValue = dto.value === null ? null : String(dto.value);
    }

    return this.prisma.customFieldValue.upsert({
      where: { fieldId_entityId: { fieldId: dto.fieldId, entityId: dto.entityId } },
      update: data,
      create: { fieldId: dto.fieldId, entityType: dto.entityType, entityId: dto.entityId, ...data },
    });
  }
}
