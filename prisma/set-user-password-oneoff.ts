// 一時スクリプト: 特定アカウントのパスワードを直接設定する(ユーザー依頼、使用後削除)
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];
  if (!email || !newPassword) {
    console.error('usage: tsx set-user-password-oneoff.ts <email> <newPassword>');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const user = await prisma.user.update({
    where: { email },
    data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
  });
  await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  console.log(`updated password for ${user.email} (id=${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
