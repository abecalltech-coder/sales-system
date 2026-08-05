import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { HealthController } from './health.controller';
import { CustomersModule } from './customers/customers.module';
import { TossCasesModule } from './toss-cases/toss-cases.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { VisitsModule } from './visits/visits.module';
import { ContractsModule } from './contracts/contracts.module';
import { EntriesModule } from './entries/entries.module';
import { MastersModule } from './masters/masters.module';
import { StatusMasterModule } from './status-master/status-master.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { AutomationRulesModule } from './automation-rules/automation-rules.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SummaryModule } from './summary/summary.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
      { name: 'auth', ttl: 60_000, limit: 10 },
    ]),
    // フロントエンド(Vite build成果物)を同一サービスから配信する(初期段階はWeb/APIを同居させる方針、architecture.md参照)。
    // Cookie認証がクロスオリジンにならないよう、当面はWeb/APIを同一オリジンでホストする。
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'web-dist'),
      exclude: ['/api/(.*)', '/socket.io/(.*)', '/health'],
    }),
    RealtimeModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    CustomersModule,
    TossCasesModule,
    AppointmentsModule,
    VisitsModule,
    ContractsModule,
    EntriesModule,
    MastersModule,
    StatusMasterModule,
    CustomFieldsModule,
    AutomationRulesModule,
    SummaryModule,
    AuditLogsModule,
    SystemSettingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
