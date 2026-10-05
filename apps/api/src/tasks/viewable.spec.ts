import { TasksService } from './tasks.module';

// 部署A: AP(a1)・APリーダー(a2)・CL(a3)・部署責任者(a4)・その他(a5)、部署B: AP(b1)・その他(b2)
const USERS = [
  { id: 'a1', name: 'a1', departmentId: 'A', roles: [{ role: { code: 'AP' } }] },
  { id: 'a2', name: 'a2', departmentId: 'A', roles: [{ role: { code: 'AP_LEADER' } }] },
  { id: 'a3', name: 'a3', departmentId: 'A', roles: [{ role: { code: 'CL' } }] },
  { id: 'a4', name: 'a4', departmentId: 'A', roles: [{ role: { code: 'RESPONSIBLE' } }] },
  { id: 'a5', name: 'a5', departmentId: 'A', roles: [] },
  { id: 'b1', name: 'b1', departmentId: 'B', roles: [{ role: { code: 'AP' } }] },
  { id: 'b2', name: 'b2', departmentId: 'B', roles: [] },
];

const service = new TasksService({ user: { findMany: jest.fn().mockResolvedValue(USERS) } } as never, {} as never, {} as never);
const ids = async (id: string, roles: string[]) => {
  const u = USERS.find((x) => x.id === id)!;
  const list: { id: string }[] = await (service as unknown as { viewableUsers: (u: unknown) => Promise<{ id: string }[]> }).viewableUsers({ id, departmentId: u.departmentId, roles });
  return list.map((x) => x.id).sort();
};

describe('他の人のタスクを見られる範囲', () => {
  it('APは自分だけ', async () => expect(await ids('a1', ['AP'])).toEqual(['a1']));
  it('APリーダーはAP全員(部署を問わない)', async () => expect(await ids('a2', ['AP_LEADER'])).toEqual(['a1', 'a2', 'b1']));
  it('CLもAP全員', async () => expect(await ids('a3', ['CL'])).toEqual(['a1', 'a2', 'a3', 'b1']));
  it('部署責任者は自部署の全員+AP全員', async () => expect(await ids('a4', ['RESPONSIBLE'])).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'b1']));
  it('統括責任者は全員', async () => expect(await ids('a5', ['GENERAL_RESPONSIBLE'])).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'b1', 'b2']));
  it('システム管理者は全員', async () => expect((await ids('b2', ['SUPER_ADMIN'])).length).toBe(7));
});
