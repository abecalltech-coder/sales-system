import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateAppointmentReportDto } from './dto/appointment-report.dto';
import { AuthenticatedUser } from '../auth/types';

const CHECKPOINT_LABELS: Record<string, string> = {
  PRE_CONTACT_RESULT: '前連結果',
  DEPARTED: '訪問に出ました',
  ARRIVED: '訪問先到着しました',
  ARRIVED_WAITING: '到着しましたが待機中です',
  VISIT_RESULT: '訪問商談結果',
  ONLINE_WAITING: 'オンライン入室待ちです',
  ONLINE_RESULT: 'オンライン商談結果',
  RESCHEDULE: 'リスケ',
};

@Injectable()
export class AppointmentReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * 実施報告を作成し、報告内容をアポ案件の備考へ自動追記する(要望)。
   * 追記した分だけAppointmentのversionもインクリメントする。
   */
  async report(dto: CreateAppointmentReportDto, userId: string) {
    const appointment = await this.prisma.appointment.findUniqueOrThrow({ where: { id: dto.appointmentId } });
    const reporter = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const label = CHECKPOINT_LABELS[dto.checkpoint] ?? dto.checkpoint;
    const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const line = `[${label}] ${dto.reportText}(${reporter?.name ?? '不明'} / ${timestamp})`;
    const newMemo = appointment.memo ? `${appointment.memo}\n${line}` : line;

    const [reportEvent] = await this.prisma.$transaction([
      this.prisma.appointmentReportEvent.create({
        data: {
          appointmentId: dto.appointmentId,
          checkpoint: dto.checkpoint,
          reportText: dto.reportText,
          reportedByUserId: userId,
        },
      }),
      this.prisma.appointment.update({
        where: { id: dto.appointmentId },
        data: { memo: newMemo, version: { increment: 1 }, updatedBy: userId },
      }),
    ]);

    this.realtime.emitCaseUpdated(
      [
        'company:default',
        ...(appointment.snapshotDepartmentId ? [`department:${appointment.snapshotDepartmentId}`] : []),
        `appointment:${appointment.id}`,
      ],
      {
        entityType: 'APPOINTMENT',
        id: appointment.id,
        version: appointment.version + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: userId,
        action: 'updated',
        changedFields: ['memo'],
      },
    );

    return reportEvent;
  }

  /** 未確認の実施報告一覧(部署責任者=MANAGERロールは自部署分、ADMIN/SUPER_ADMINは全件) */
  async listPending(user: AuthenticatedUser) {
    const isAdmin = user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN');
    const isManager = user.roles.includes('MANAGER');
    if (!isAdmin && !(isManager && user.departmentId)) return [];

    const where: Prisma.AppointmentReportEventWhereInput = {
      acknowledgedAt: null,
      ...(isAdmin ? {} : { appointment: { is: { snapshotDepartmentId: user.departmentId } } }),
    };

    return this.prisma.appointmentReportEvent.findMany({
      where,
      orderBy: { reportedAt: 'desc' },
      include: {
        appointment: { select: { id: true, caseNumber: true, customer: { select: { corporateName: true } } } },
      },
    });
  }

  async acknowledge(id: string, userId: string) {
    return this.prisma.appointmentReportEvent.update({
      where: { id },
      data: { acknowledgedByUserId: userId, acknowledgedAt: new Date() },
    });
  }
}
