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
  manualOrder: number | null;
  version: number;
  appointment: { id: string; caseNumber: string } | null;
}

export function useTossCases(params: {
  page: number;
  pageSize: number;
  keyword?: string;
  statusId?: string;
  periodMonth?: string;
  includePrevMonth?: boolean;
}) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    ...(params.keyword ? { keyword: params.keyword } : {}),
    ...(params.statusId ? { statusId: params.statusId } : {}),
    ...(params.periodMonth ? { periodMonth: params.periodMonth } : {}),
    ...(params.includePrevMonth ? { includePrevMonth: 'true' } : {}),
  });
  return useQuery({
    queryKey: ['toss-cases', params],
    queryFn: () => api.get<PagedResult<TossCaseListItem>>(`/toss-cases?${query.toString()}`),
  });
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
  meetingEndAt: string | null;
  meetingType: string;
  meetingStatusId: string;
  visitAddress: string | null;
  meetingUrl: string | null;
  calendarSyncStatus: string;
  calendarSyncError: string | null;
  memo: string | null;
  manualOrder: number | null;
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
  calendarColor: string | null;
  calendarTitle: string | null;
  calendarBracketLabel: string | null;
  preContactAt: string | null;
  reminderEnabled: boolean;
  reminderMinutesBefore: number | null;
}

export function useAppointments(params: {
  page: number;
  pageSize: number;
  keyword?: string;
  statusId?: string;
  userId?: string;
  departmentId?: string;
  closerStatusId?: string;
  periodMonth?: string;
  includePrevMonth?: boolean;
  dateFrom?: string;
  dateTo?: string;
}) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    ...(params.keyword ? { keyword: params.keyword } : {}),
    ...(params.statusId ? { statusId: params.statusId } : {}),
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.departmentId ? { departmentId: params.departmentId } : {}),
    ...(params.closerStatusId ? { closerStatusId: params.closerStatusId } : {}),
    ...(params.periodMonth ? { periodMonth: params.periodMonth } : {}),
    ...(params.includePrevMonth ? { includePrevMonth: 'true' } : {}),
    ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
    ...(params.dateTo ? { dateTo: params.dateTo } : {}),
  });
  return useQuery({
    queryKey: ['appointments', params],
    queryFn: () => api.get<{ items: AppointmentListItem[]; total: number; page: number; pageSize: number }>(
      `/appointments?${query.toString()}`,
    ),
  });
}

// ============================================================
// CLカレンダー: 実施報告
// ============================================================
export const REPORT_CHECKPOINTS = [
  { id: 'PRE_CONTACT_RESULT', label: '前連結果' },
  { id: 'DEPARTED', label: '訪問に出ました' },
  { id: 'ARRIVED', label: '訪問先到着しました' },
  { id: 'ARRIVED_WAITING', label: '到着しましたが待機中です' },
  { id: 'VISIT_RESULT', label: '訪問商談結果' },
  { id: 'ONLINE_WAITING', label: 'オンライン入室待ちです' },
  { id: 'ONLINE_RESULT', label: 'オンライン商談結果' },
  { id: 'RESCHEDULE', label: 'リスケ' },
] as const;

export interface PendingReportItem {
  id: string;
  appointmentId: string;
  checkpoint: string;
  reportText: string;
  reportedByUserId: string | null;
  reportedAt: string;
  acknowledgedAt: string | null;
  appointment: { id: string; caseNumber: string; customer: { corporateName: string | null } | null };
}

export function usePendingReports() {
  return useQuery({
    queryKey: ['appointment-reports', 'pending'],
    queryFn: () => api.get<PendingReportItem[]>('/appointment-reports/pending'),
    refetchInterval: 30_000,
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
  manualOrder: number | null;
  version: number;
}

export function useContracts(params: {
  page: number;
  pageSize: number;
  statusId?: string;
  keyword?: string;
  periodMonth?: string;
  includePrevMonth?: boolean;
}) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    ...(params.statusId ? { statusId: params.statusId } : {}),
    ...(params.keyword ? { keyword: params.keyword } : {}),
    ...(params.periodMonth ? { periodMonth: params.periodMonth } : {}),
    ...(params.includePrevMonth ? { includePrevMonth: 'true' } : {}),
  });
  return useQuery({
    queryKey: ['contracts', params],
    queryFn: () => api.get<{ items: ContractListItem[]; total: number; page: number; pageSize: number }>(
      `/contracts?${query.toString()}`,
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
// サマリー(表)
// ============================================================
export interface SummarySheetListItem {
  id: string;
  name: string;
  order: number;
  rowCount: number;
  colCount: number;
}

export interface SummarySheetCell {
  row: number;
  col: number;
  value: string | null;
}

export interface SummarySheetDetail extends SummarySheetListItem {
  cells: SummarySheetCell[];
}

export function useSummarySheets() {
  return useQuery({ queryKey: ['summary-sheets'], queryFn: () => api.get<SummarySheetListItem[]>('/summary-sheets') });
}

export function useSummarySheet(id: string | undefined) {
  return useQuery({
    queryKey: ['summary-sheets', id],
    queryFn: () => api.get<SummarySheetDetail>(`/summary-sheets/${id}`),
    enabled: !!id,
  });
}

// ============================================================
// 月次サマリー実績表 / ロスター
// ============================================================
export interface UserOption {
  id: string;
  name: string;
  employeeCode: string | null;
  departmentId: string | null;
  teamId: string | null;
}

export function useUserOptions() {
  return useQuery({
    queryKey: ['user-options'],
    queryFn: () => api.get<UserOption[]>('/users/options'),
    staleTime: 5 * 60_000,
  });
}

export interface SummaryColumnDef {
  code: string;
  label: string;
  kind: 'manual' | 'auto' | 'computed';
  formula?: string;
  percent?: boolean;
}

export interface MonthlySummaryRow {
  id: string;
  userId: string | null;
  userName: string | null;
  role: string | null;
  order: number;
  values: Record<string, number | string | null>;
  auto: Record<string, number> | null;
}

export interface MonthlySummaryResponse {
  period: string;
  departmentId: string;
  columns: SummaryColumnDef[];
  rows: MonthlySummaryRow[];
}

export interface MonthlySummaryDepartment {
  id: string;
  displayName: string;
  color: string | null;
}

export function useMonthlySummaryDepartments() {
  return useQuery({
    queryKey: ['monthly-summary-departments'],
    queryFn: () => api.get<MonthlySummaryDepartment[]>('/monthly-summary/departments'),
    staleTime: 5 * 60_000,
  });
}

export function useMonthlySummary(period: string, departmentId: string | undefined) {
  return useQuery({
    queryKey: ['monthly-summary', period, departmentId],
    queryFn: () =>
      api.get<MonthlySummaryResponse>(`/monthly-summary?period=${period}&departmentId=${departmentId}`),
    enabled: !!period && !!departmentId,
  });
}

// ============================================================
// 月次シフト表
// ============================================================
export interface ShiftAttributeDef {
  code: string;
  label: string;
}

export interface MonthlyShiftRow {
  id: string;
  no: number;
  userId: string | null;
  userName: string | null;
  order: number;
  attributes: Record<string, string | number | null>;
  days: Record<string, number>;
}

export interface MonthlyShiftResponse {
  period: string;
  days: string[];
  attributeDefs: ShiftAttributeDef[];
  rows: MonthlyShiftRow[];
}

export function useMonthlyShift(period: string) {
  return useQuery({
    queryKey: ['monthly-shift', period],
    queryFn: () => api.get<MonthlyShiftResponse>(`/monthly-shift?period=${period}`),
    enabled: !!period,
  });
}

// ============================================================
// 最終報告
// ============================================================
export interface FinalReportField {
  id: string;
  code: string | null;
  label: string;
  fieldType: 'NUMBER' | 'TEXT';
  computed: string | null;
  unit: string | null;
  order: number;
  active: boolean;
}

export interface FinalReportMonth {
  period: string;
  userId: string;
  userName: string | null;
  days: string[];
  fields: FinalReportField[];
  entries: Record<string, Record<string, number | string>>;
}

export function useFinalReportFields() {
  return useQuery({
    queryKey: ['final-report-fields'],
    queryFn: () => api.get<FinalReportField[]>('/final-reports/fields'),
    staleTime: 5 * 60_000,
  });
}

export function useFinalReportMonth(period: string, userId?: string) {
  const q = userId ? `&userId=${userId}` : '';
  return useQuery({
    queryKey: ['final-report-month', period, userId ?? 'me'],
    queryFn: () => api.get<FinalReportMonth>(`/final-reports/entries?period=${period}${q}`),
    enabled: !!period,
  });
}

export function useFinalReportAdminFields() {
  return useQuery({
    queryKey: ['final-report-admin-fields'],
    queryFn: () => api.get<FinalReportField[]>('/final-reports/admin/fields'),
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

export interface GoogleCalendarStatus {
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
  calendarId: string;
  redirectUri: string | null;
}

export function useGoogleCalendarStatus() {
  return useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: () => api.get<GoogleCalendarStatus>('/integrations/google-calendar/status'),
  });
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

// ============================================================
// トス登録フォーム(アポインター用) / トスフォーム設定(管理)
// ============================================================
export interface TossFormField {
  id: string;
  targetKey: string;
  label: string;
  fieldType: 'TEXT' | 'TEXTAREA' | 'SELECT' | 'MULTISELECT' | 'RADIO' | 'DATE' | 'DATETIME';
  required: boolean;
  active: boolean;
  order: number;
  helpText: string | null;
  optionsMode: 'NONE' | 'STATIC' | 'MASTER' | 'USERS';
  masterCategory: string | null;
  staticOptions: string[];
  options: string[];
}

export function useTossFormFields(all = false) {
  return useQuery({
    queryKey: ['toss-form-fields', all],
    queryFn: () => api.get<TossFormField[]>(`/toss-form/fields${all ? '?all=1' : ''}`),
  });
}
