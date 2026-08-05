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
