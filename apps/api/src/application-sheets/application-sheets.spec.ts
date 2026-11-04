import { NotFoundException } from '@nestjs/common';
import { ApplicationSheetsService } from './application-sheets.module';

/** 申込情報は本人だけのもの(要望)。他のアカウントの分は見られず、変更もできない */
describe('ApplicationSheetsService(本人のみ)', () => {
  const sheet = { id: 's1', createdBy: 'owner', updatedBy: 'owner', hasJuryo: true, hasDoryoku: false, deletedAt: null };
  const photo = { id: 'p1', sheetId: 's1', sheet };

  const setup = () => {
    const prisma = {
      applicationSheet: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(async ({ where }) => (where.id === sheet.id && where.createdBy === sheet.createdBy ? sheet : null)),
        update: jest.fn().mockResolvedValue(sheet),
      },
      applicationSheetPhoto: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(async ({ where }) => (where.id === photo.id && where.sheet.createdBy === sheet.createdBy ? photo : null)),
        create: jest.fn().mockResolvedValue(photo),
        delete: jest.fn().mockResolvedValue(photo),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const realtime = { emitToUser: jest.fn(), emitToAll: jest.fn() };
    return { prisma, realtime, service: new ApplicationSheetsService(prisma as never, realtime as never) };
  };

  it('一覧は本人の作成分だけを取る', async () => {
    const { prisma, service } = setup();
    await service.list('owner');
    expect(prisma.applicationSheet.findMany.mock.calls[0][0].where).toEqual({ createdBy: 'owner', deletedAt: null });
  });

  it('他のアカウントは更新・削除できない', async () => {
    const { prisma, service } = setup();
    await expect(service.update('s1', { data: {} }, 'other')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('s1', 'other')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.applicationSheet.update).not.toHaveBeenCalled();
  });

  it('他のアカウントは写真を見る・追加する・消すことができない', async () => {
    const { prisma, service } = setup();
    const dto = { section: 'juryo', image: 'data:image/jpeg;base64,x', thumb: 'data:image/jpeg;base64,x' };
    await expect(service.photos('s1', 'other')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.photo('p1', 'other')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.addPhoto('s1', dto, 'other')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removePhoto('p1', 'other')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.applicationSheetPhoto.create).not.toHaveBeenCalled();
    expect(prisma.applicationSheetPhoto.delete).not.toHaveBeenCalled();
  });

  it('本人は更新でき、変更の通知は本人にだけ送る', async () => {
    const { prisma, realtime, service } = setup();
    await service.update('s1', { data: {} }, 'owner');
    expect(prisma.applicationSheet.update).toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith('owner', 'application-sheets.updated', { id: 's1' });
    expect(realtime.emitToAll).not.toHaveBeenCalled();
  });
});
