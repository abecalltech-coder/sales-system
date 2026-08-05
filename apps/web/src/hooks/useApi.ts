import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Me {
  id: string;
  name: string;
  email: string;
  roles: string[];
  departmentId: string | null;
  teamId: string | null;
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me') });
}

export interface StatusMasterItem {
  id: string;
  category: string;
  internalCode: string;
  displayName: string;
  color: string | null;
  order: number;
}

export function useStatuses(category?: string) {
  return useQuery({
    queryKey: ['statuses', category],
    queryFn: () => api.get<StatusMasterItem[]>(`/masters/statuses${category ? `?category=${category}` : ''}`),
  });
}

interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TossCaseListItem {
  id: string;
  caseNumber: string;
  receivedAt: string;
  statusId: string;
  memo: string | null;
  customer: { corporateName: string | null; contactName: string | null; phone: string | null } | null;
}

export function useTossCases(params: { page: number; pageSize: number; keyword?: string; statusId?: string }) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    ...(params.keyword ? { keyword: params.keyword } : {}),
    ...(params.statusId ? { statusId: params.statusId } : {}),
  });
  return useQuery({
    queryKey: ['toss-cases', params],
    queryFn: () => api.get<PagedResult<TossCaseListItem>>(`/toss-cases?${query.toString()}`),
  });
}

export interface KpiSummary {
  range: { gte: string; lte: string };
  counts: {
    tossCount: number;
    appointmentCount: number;
    visitScheduledCount: number;
    visitArrivedCount: number;
    meetingCount: number;
    contractCount: number;
    entryCount: number;
  };
  conversionRates: {
    tossToAppointment: number;
    appointmentToVisit: number;
    visitToMeeting: number;
    meetingToContract: number;
    contractToEntry: number;
  };
}

export function useKpiSummary() {
  return useQuery({ queryKey: ['summary', 'kpi'], queryFn: () => api.get<KpiSummary>('/summary/kpi') });
}

export interface TossCaseDetail extends TossCaseListItem {
  version: number;
  desiredAt: string | null;
  confirmedStartAt: string | null;
  confirmedEndAt: string | null;
  tossUserId: string | null;
  salesUserId: string | null;
  appointment: { id: string; caseNumber: string } | null;
}

export function useTossCase(id: string) {
  return useQuery({
    queryKey: ['toss-cases', id],
    queryFn: () => api.get<TossCaseDetail>(`/toss-cases/${id}`),
    enabled: !!id,
  });
}

// ============================================================
// アポ
// ============================================================
export interface AppointmentListItem {
  id: string;
  caseNumber: string;
  meetingStartAt: string | null;
  meetingType: string;
  meetingStatusId: string;
  visitAddress: string | null;
  calendarSyncStatus: string;
  version: number;
}

export function useAppointments(params: { page: number; pageSize: number; keyword?: string; statusId?: string }) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    ...(params.keyword ? { keyword: params.keyword } : {}),
    ...(params.statusId ? { statusId: params.statusId } : {}),
  });
  return useQuery({
    queryKey: ['appointments', params],
    queryFn: () => api.get<{ items: AppointmentListItem[]; total: number; page: number; pageSize: number }>(
      `/appointments?${query.toString()}`,
    ),
  });
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: ['appointments', id],
    queryFn: () => api.get<AppointmentListItem & { memo: string | null; contract: { id: string; caseNumber: string } | null }>(`/appointments/${id}`),
    enabled: !!id,
  });
}

// ============================================================
// 訪問
// ============================================================
export interface VisitListItem {
  id: string;
  caseNumber: string;
  scheduledAt: string;
  statusId: string;
  visitKind: string;
  version: number;
}

export function useVisits(params: { page: number; pageSize: number; statusId?: string }) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    ...(params.statusId ? { statusId: params.statusId } : {}),
  });
  return useQuery({
    queryKey: ['visits', params],
    queryFn: () => api.get<{ items: VisitListItem[]; total: number; page: number; pageSize: number }>(
      `/visits?${query.toString()}`,
    ),
  });
}

export function useVisit(id: string) {
  return useQuery({
    queryKey: ['visits', id],
    queryFn: () => api.get<VisitListItem & { arrivedAt: string | null; meetingSession: { meetingResult: string | null } | null }>(`/visits/${id}`),
    enabled: !!id,
  });
}

// ============================================================
// 成約
// ============================================================
export interface ContractListItem {
  id: string;
  caseNumber: string;
  matchingStatusId: string;
  contractedAt: string | null;
  contractAmount: string | null;
  version: number;
}

export function useContracts(params: { page: number; pageSize: number; statusId?: string; keyword?: string }) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    ...(params.statusId ? { statusId: params.statusId } : {}),
    ...(params.keyword ? { keyword: params.keyword } : {}),
  });
  return useQuery({
    queryKey: ['contracts', params],
    queryFn: () => api.get<{ items: ContractListItem[]; total: number; page: number; pageSize: number }>(
      `/contracts?${query.toString()}`,
    ),
  });
}

export function useContract(id: string) {
  return useQuery({
    queryKey: ['contracts', id],
    queryFn: () => api.get<ContractListItem & { matchingAt: string | null; switchingAt: string | null; memo: string | null }>(`/contracts/${id}`),
    enabled: !!id,
  });
}

// ============================================================
// エントリー
// ============================================================
export interface EntryListItem {
  id: string;
  caseNumber: string;
  statusId: string;
  entryAt: string | null;
  version: number;
}

export function useEntries(params: { page: number; pageSize: number; statusId?: string }) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    ...(params.statusId ? { statusId: params.statusId } : {}),
  });
  return useQuery({
    queryKey: ['entries', params],
    queryFn: () => api.get<{ items: EntryListItem[]; total: number; page: number; pageSize: number }>(
      `/entries?${query.toString()}`,
    ),
  });
}

export function useEntry(id: string) {
  return useQuery({
    queryKey: ['entries', id],
    queryFn: () => api.get<EntryListItem & { memo: string | null; deficiencyNote: string | null }>(`/entries/${id}`),
    enabled: !!id,
  });
}

// ============================================================
// 管理者向け: ユーザー管理
// ============================================================
export interface UserListItem {
  id: string;
  email: string;
  name: string;
  employeeCode: string | null;
  departmentId: string | null;
  teamId: string | null;
  status: string;
  version: number;
  roles: { role: { code: string; name: string } }[];
}

export function useUsers(params: { page: number; pageSize: number; keyword?: string }) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    ...(params.keyword ? { keyword: params.keyword } : {}),
  });
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => api.get<{ items: UserListItem[]; total: number; page: number; pageSize: number }>(
      `/users?${query.toString()}`,
    ),
  });
}

// ============================================================
// 管理者向け: 組織管理
// ============================================================
export interface TeamItem {
  id: string;
  name: string;
  order: number;
  active: boolean;
  version: number;
}
export interface DepartmentItem {
  id: string;
  name: string;
  order: number;
  active: boolean;
  version: number;
  teams: TeamItem[];
}

export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: () => api.get<DepartmentItem[]>('/organizations/departments') });
}

// ============================================================
// 管理者向け: マスタ管理(商材・流入元)
// ============================================================
export interface MasterItem {
  id: string;
  name: string;
  active: boolean;
  order: number;
}

export function useProducts() {
  return useQuery({ queryKey: ['products'], queryFn: () => api.get<MasterItem[]>('/masters/products') });
}
export function useSources() {
  return useQuery({ queryKey: ['sources'], queryFn: () => api.get<MasterItem[]>('/masters/sources') });
}

// ============================================================
// 管理者向け: カスタム項目
// ============================================================
export interface CustomFieldItem {
  id: string;
  entityType: string;
  fieldKey: string;
  label: string;
  dataType: string;
  required: boolean;
  order: number;
  active: boolean;
  options: { id: string; label: string; value: string }[];
}

export function useCustomFields(entityType?: string) {
  return useQuery({
    queryKey: ['custom-fields', entityType],
    queryFn: () => api.get<CustomFieldItem[]>(`/custom-fields${entityType ? `?entityType=${entityType}` : ''}`),
  });
}

// ============================================================
// モバイル訪問営業
// ============================================================
export interface MobileVisitItem {
  id: string;
  caseNumber: string;
  scheduledAt: string;
  statusId: string;
  arrivedAt: string | null;
  version: number;
  appointment: {
    visitAddress: string | null;
    customer: { corporateName: string | null; contactName: string | null; phone: string | null; address: string | null } | null;
  };
}

export function useMobileHome() {
  return useQuery({ queryKey: ['mobile', 'home'], queryFn: () => api.get<MobileVisitItem[]>('/mobile/home') });
}

export function useMobileVisit(id: string) {
  return useQuery({
    queryKey: ['visits', id, 'mobile'],
    queryFn: () =>
      api.get<
        MobileVisitItem & {
          meetingSession: { meetingStartedAt: string | null; meetingEndedAt: string | null; meetingResult: string | null } | null;
        }
      >(`/visits/${id}`),
    enabled: !!id,
  });
}
