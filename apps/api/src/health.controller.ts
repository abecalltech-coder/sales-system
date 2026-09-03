import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './common/decorators/permissions.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Railway等のヘルスチェックは認証情報を送らないため、認証不要にする
  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      time: new Date().toISOString(),
      // RailwayがGitHub連携デプロイ時に注入する。デプロイ後のヘルスチェックで
      // 「新しいコミットが実際に稼働しているか」を判定するために公開する。
      commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    };
  }
}
