// 既存のトス連携アポ案件へ、共通項目(備考は除く)を一度だけバックフィルするスクリプト。
// 既にアポ側に値が入っている項目は上書きしない(手動編集済みのデータを保護するため)。
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SHARED_FIELDS = [
  'apStaffName',
  'department',
  'listName',
  'industry',
  'hook',
  'existingContract',
  'preConfirmStatusId',
] as const;

async function main() {
  const appointments = await prisma.appointment.findMany({
    where: { tossCaseId: { not: null }, deletedAt: null },
    include: { tossCase: true },
  });

  let updated = 0;
  for (const appt of appointments) {
    if (!appt.tossCase) continue;
    const patch: Record<string, string> = {};
    for (const field of SHARED_FIELDS) {
      const current = appt[field];
      const source = appt.tossCase[field];
      if (!current && source) patch[field] = source;
    }
    if (Object.keys(patch).length > 0) {
      await prisma.appointment.update({ where: { id: appt.id }, data: patch });
      updated++;
      console.log(`updated ${appt.caseNumber}: ${Object.keys(patch).join(', ')}`);
    }
  }

  console.log(`完了: 対象${appointments.length}件中${updated}件を更新しました`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
