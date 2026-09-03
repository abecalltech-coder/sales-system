import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 本人の設定値を1件取得する。未設定ならnull。 */
  async get(userId: string, key: string): Promise<unknown> {
    const row = await this.prisma.userPreference.findUnique({
      where: { userId_key: { userId, key } },
    });
    return row ? row.value : null;
  }

  /** 本人の設定値を1件upsertする。 */
  async set(userId: string, key: string, value: unknown): Promise<unknown> {
    const row = await this.prisma.userPreference.upsert({
      where: { userId_key: { userId, key } },
      update: { value: value as never },
      create: { userId, key, value: value as never },
    });
    return row.value;
  }
}
