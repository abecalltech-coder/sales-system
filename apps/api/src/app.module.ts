import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
      { name: 'auth', ttl: 60_000, limit: 10 },
    ]),
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
