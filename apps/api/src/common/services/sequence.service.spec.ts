import { Test } from '@nestjs/testing';
import { SequenceService } from './sequence.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SequenceService', () => {
  let service: SequenceService;
  let prisma: { $transaction: jest.Mock; sequenceCounter: { upsert: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
      sequenceCounter: { upsert: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [SequenceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(SequenceService);
  });

  it('TOS-YYYYMM-000001形式で採番される', async () => {
    prisma.sequenceCounter.upsert.mockResolvedValue({ key: 'TOS-202608', lastValue: 1 });

    const result = await service.nextCaseNumber('TOSS', new Date('2026-08-15T00:00:00Z'));

    expect(result).toBe('TOS-202608-000001');
    expect(prisma.sequenceCounter.upsert).toHaveBeenCalledWith({
      where: { key: 'TOS-202608' },
      update: { lastValue: { increment: 1 } },
      create: { key: 'TOS-202608', lastValue: 1 },
    });
  });

  it('6桁ゼロパディングされる(2回目以降の採番)', async () => {
    prisma.sequenceCounter.upsert.mockResolvedValue({ key: 'APO-202608', lastValue: 42 });

    const result = await service.nextCaseNumber('APPOINTMENT', new Date('2026-08-01T00:00:00Z'));

    expect(result).toBe('APO-202608-000042');
  });

  it('年月が変わるとキーが変わる', async () => {
    prisma.sequenceCounter.upsert.mockResolvedValue({ key: 'CNT-202601', lastValue: 3 });

    const result = await service.nextCaseNumber('CONTRACT', new Date('2026-01-31T23:59:59Z'));

    expect(result).toBe('CNT-202601-000003');
  });
});
