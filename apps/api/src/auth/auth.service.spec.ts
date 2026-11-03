import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; findUniqueOrThrow: jest.Mock };
    refreshToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  const baseUser = {
    id: 'user-1',
    email: 'taro@example.com',
    status: 'ACTIVE',
    deletedAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: () => 'signed.jwt.token' } },
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('正しいメール/パスワードでログインできる', async () => {
    const passwordHash = await bcrypt.hash('CorrectPass1', 10);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
    prisma.user.update.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    const result = await service.login('taro@example.com', 'CorrectPass1', '127.0.0.1');

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(typeof result.refreshToken).toBe('string');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { failedLoginCount: 0, lockedUntil: null } }),
    );
  });

  it('パスワードが誤っている場合はUnauthorizedExceptionを投げる', async () => {
    const passwordHash = await bcrypt.hash('CorrectPass1', 10);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });
    prisma.user.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    await expect(service.login('taro@example.com', 'WrongPass', '127.0.0.1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('5回失敗するとロックされる', async () => {
    const passwordHash = await bcrypt.hash('CorrectPass1', 10);
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash, failedLoginCount: 4 });
    prisma.user.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    await expect(service.login('taro@example.com', 'WrongPass', '127.0.0.1')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: expect.any(Date) }),
      }),
    );
  });

  it('存在しないメールアドレスの場合もUnauthorizedException(情報漏洩を防ぐため同一メッセージ)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.auditLog.create.mockResolvedValue({});

    await expect(service.login('unknown@example.com', 'anything', '127.0.0.1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  describe('リフレッシュ(複数端末で常時ログイン)', () => {
    const active = { id: 't1', userId: 'user-1', tokenHash: 'h', expiresAt: new Date(Date.now() + 86400_000), revokedAt: null, replacedBy: null, familyId: 'fam-A' };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({});
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    });

    it('ローテーションしても同じ端末の系列を引き継ぐ', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(active);
      await service.refresh('raw', undefined);
      expect(prisma.refreshToken.create.mock.calls[0][0].data.familyId).toBe('fam-A');
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('交換直後の古いトークン(通信の行き違い)は、その端末だけで出し直してログインを保つ', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ ...active, revokedAt: new Date(Date.now() - 30_000), replacedBy: 'next' });
      const r = await service.refresh('raw', undefined);
      expect(typeof r.refreshToken).toBe('string');
      // 失効させるのはその端末の系列だけ(他の端末はログインしたまま)
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({ where: { familyId: 'fam-A', revokedAt: null }, data: expect.anything() });
      expect(prisma.refreshToken.create.mock.calls[0][0].data.familyId).toBe('fam-A');
    });

    it('時間が経った失効済みトークンは拒否し、その端末の系列だけ失効させる(ユーザーの全端末は失効させない)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ ...active, revokedAt: new Date(Date.now() - 3600_000), replacedBy: 'next' });
      await expect(service.refresh('raw', undefined)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.updateMany.mock.calls[0][0].where).toEqual({ familyId: 'fam-A', revokedAt: null });
    });

    it('ログインごとに別の系列になる', async () => {
      await service.issueRefreshToken('user-1', undefined);
      await service.issueRefreshToken('user-1', undefined);
      const [a, b] = prisma.refreshToken.create.mock.calls.map((c) => c[0].data.familyId);
      expect(a).toBeTruthy();
      expect(a).not.toBe(b);
    });
  });
});
