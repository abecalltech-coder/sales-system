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
  receivedAt: string;
  statusId: string;
  memo: string | null;
  customer: { corporateName: string | null; contactName: string | null; phone: string | null; address: string | null } | null;
  prefecture: string | null;
  nextActionAt: string | null;
  apStaffName: string | null;
  department: string | null;
  proposal: string | null;
  listName: string | null;
  callDirection: string | null;
  industry: string | null;
  hook: string | null;
  existingContract: string | null;
  preConfirmStatusId: string | null;
  progressStatusId: string | null;
  ngReasonStatusId: string | null;
  isCallingInProgress: boolean;
  callingByUserId: string | null;
  version: number;
  appointment: { id: string; caseNumber: string } | null;
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

// ============================================================
// アポ
// ============================================================
export interface AppointmentListItem {
  id: string;
  caseNumber: string;
  createdAt: string;
  storeName: string | null;
  customer: { corporateName: string | null; contactName: string | null; phone: string | null; address: string | null; email: string | null } | null;
  prefecture: string | null;
  meetingStartAt: string | null;
  meetingType: string;
  meetingStatusId: string;
  visitAddress: string | null;
  calendarSyncStatus: string;
  calendarSyncError: string | null;
  memo: string | null;
  version: number;
  contract: { id: string; caseNumber: string } | null;

  apStaffName: string | null;
  preConfirmStatusId: string | null;
  preContactStatusId: string | null;
  closerStatusId: string | null;
  hook: string | null;
  department: string | null;
  industry: string | null;
  importantMattersOkAt: string | null;
  electronicContractAt: string | null;
  nextActionAt: string | null;
  hpProgressStatusId: string | null;
  typeStatusId: string | null;
  progressStatusId: string | null;
  listName: string | null;
  acquisitionMethodStatusId: string | null;
  proposalLocation: string | null;
  existingContract: string | null;
  anshinBizProposed: boolean;
  anshinBizStatusId: string | null;
  anshinBizLostReasonStatusId: string | null;
  anshinBizPoints: number | null;
  mobileProposed: boolean;
  mobileStatusId: string | null;
  mobileLostReasonStatusId: string | null;
  funfoProposed: boolean;
  funfoStatusId: string | null;
  funfoLostReasonStatusId: string | null;
  deductionNote: string | null;
  consentFormTypeStatusId: string | null;
  acquiredCompanyName: string | null;
  deliveryMethodStatusId: string | null;
  deliveryStatusStatusId: string | null;
  deliveredAt: string | null;
  specialNotes: string | null;
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

// ============================================================
// 訪問
// ============================================================
export interface VisitListItem {
  id: string;
  caseNumber: string;
  storeName: string | null;
  scheduledAt: string;
  statusId: string;
  visitKind: string;
  arrivedAt: string | null;
  meetingSession: { meetingResult: string | null } | null;
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

// ============================================================
// 成約
// ============================================================
export interface ContractListItem {
  id: string;
  caseNumber: string;
  storeName: string | null;
  matchingStatusId: string;
  contractedAt: string | null;
  contractAmount: string | null;
  revenueForecast: string | null;
  feeForecast: string | null;
  contractNumber: string | null;
  applicationNumber: string | null;
  matchingAt: string | null;
  switchingScheduledAt: string | null;
  switchingAt: string | null;
  cancelledAt: string | null;
  terminatedAt: string | null;
  deficiencyNote: string | null;
  nextActionAt: string | null;
  memo: string | null;
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

// ============================================================
// エントリー
// ============================================================
export interface EntryListItem {
  id: string;
  caseNumber: string;
  storeName: string | null;
  statusId: string;
  entryAt: string | null;
  deficiencyNote: string | null;
  memo: string | null;
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

export function useUsers(params: { page: number; pageSize: number; keyword?: string; status?: string }) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    ...(params.keyword ? { keyword: params.keyword } : {}),
    ...(params.status ? { status: params.status } : {}),
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

// ============================================================
// 顧客管理
// ============================================================
export interface CustomerListItem {
  id: string;
  corporateName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  version: number;
}

export function useCustomers(params: { page: number; pageSize: number; keyword?: string }) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    ...(params.keyword ? { keyword: params.keyword } : {}),
  });
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => api.get<{ items: CustomerListItem[]; total: number; page: number; pageSize: number }>(
      `/customers?${query.toString()}`,
    ),
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: () => api.get<CustomerListItem & { postalCode: string | null; building: string | null; memo: string | null }>(`/customers/${id}`),
    enabled: !!id,
  });
}

// ============================================================
// 操作ログ・システム設定
// ============================================================
export interface AuditLogItem {
  id: string;
  action: string;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
}

export function useAuditLogs(params: { page: number; pageSize: number }) {
  const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) });
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => api.get<{ items: AuditLogItem[]; total: number; page: number; pageSize: number }>(
      `/audit-logs?${query.toString()}`,
    ),
  });
}

export interface SystemSettingItem {
  key: string;
  value: unknown;
}

export function useSystemSettings() {
  return useQuery({ queryKey: ['system-settings'], queryFn: () => api.get<SystemSettingItem[]>('/system-settings') });
}

// ============================================================
// コメント(全案件種別共通)
// ============================================================
export interface CommentItem {
  id: string;
  entityType: string;
  entityId: string;
  userId: string;
  body: string;
  createdAt: string;
}

export function useComments(entityType: string, entityId: string) {
  return useQuery({
    queryKey: ['comments', entityType, entityId],
    queryFn: () => api.get<CommentItem[]>(`/comments?entityType=${entityType}&entityId=${entityId}`),
    enabled: !!entityId,
  });
}
