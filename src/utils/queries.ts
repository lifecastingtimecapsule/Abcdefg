import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, post, put, del } from './api/client';
import { API_ENDPOINTS, withQuery } from './api/endpoints';
import { CACHE_CONFIG } from './api/config';
import { queryKeys, invalidateQueries } from './queryClient';
import { toast } from 'sonner@2.0.3';
import type { Reservation, Customer, WorkOrder } from '../types';

// ============================================
// ダッシュボード
// ============================================

interface DashboardData {
  top_work_orders: any[];
  today_reservations: any[];
  tentative_reservations: any[];
  stats: {
    total_customers: number;
    active_work_orders: number;
    upcoming_reservations: number;
  };
  overdue_work_orders: number;
}

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiRequest<DashboardData>(API_ENDPOINTS.dashboard),
    staleTime: CACHE_CONFIG.frequent.staleTime,
    gcTime: CACHE_CONFIG.frequent.gcTime,
  });
}

// ============================================
// 予約関連
// ============================================

export function useReservations() {
  return useQuery({
    queryKey: queryKeys.reservations,
    queryFn: () => apiRequest<{ reservations: Reservation[] }>(API_ENDPOINTS.reservations.list),
    select: (data) => data.reservations,
  });
}

export function useReservation(id: string | null) {
  return useQuery({
    queryKey: queryKeys.reservation(id || ''),
    queryFn: () => apiRequest<{ reservation: Reservation }>(API_ENDPOINTS.reservations.detail(id || '')),
    select: (data) => data.reservation,
    enabled: !!id,
  });
}

export function useCreateReservation() {
  return useMutation({
    mutationFn: (data: any) => post(API_ENDPOINTS.reservations.create, data),
    onSuccess: () => {
      invalidateQueries.reservations();
      invalidateQueries.dashboard();
      toast.success('予約を作成しました');
    },
    onError: (error: any) => {
      toast.error(`予約の作成に失敗しました: ${error.message}`);
    },
  });
}

export function useUpdateReservation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      put(API_ENDPOINTS.reservations.update(id), data),
    onSuccess: (_, { id }) => {
      invalidateQueries.reservations();
      invalidateQueries.dashboard();
      queryClient.invalidateQueries({ queryKey: queryKeys.reservation(id) });
      toast.success('予約を更新しました');
    },
    onError: (error: any) => {
      toast.error(`予約の更新に失敗しました: ${error.message}`);
    },
  });
}

export function useDeleteReservation() {
  return useMutation({
    mutationFn: (id: string) => del(API_ENDPOINTS.reservations.delete(id)),
    onSuccess: () => {
      invalidateQueries.reservations();
      invalidateQueries.dashboard();
      toast.success('予約を削除しました');
    },
    onError: (error: any) => {
      toast.error(`予約の削除に失敗しました: ${error.message}`);
    },
  });
}

// ============================================
// 顧客関連
// ============================================

export function useCustomers() {
  return useQuery({
    queryKey: queryKeys.customers,
    queryFn: () => apiRequest<{ customers: Customer[] }>(API_ENDPOINTS.customers.list),
    select: (data) => data.customers,
  });
}

export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: queryKeys.customer(id || ''),
    queryFn: () => apiRequest<{ customer: Customer }>(API_ENDPOINTS.customers.detail(id || '')),
    select: (data) => data.customer,
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  return useMutation({
    mutationFn: (data: any) => post(API_ENDPOINTS.customers.create, data),
    onSuccess: () => {
      invalidateQueries.customers();
      toast.success('顧客を作成しました');
    },
    onError: (error: any) => {
      toast.error(`顧客の作成に失敗しました: ${error.message}`);
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      put(API_ENDPOINTS.customers.update(id), data),
    onSuccess: (_, { id }) => {
      invalidateQueries.customers();
      queryClient.invalidateQueries({ queryKey: queryKeys.customer(id) });
      toast.success('顧客情報を更新しました');
    },
    onError: (error: any) => {
      toast.error(`顧客情報の更新に失敗しました: ${error.message}`);
    },
  });
}

export function useDeleteCustomer() {
  return useMutation({
    mutationFn: (id: string) => del(API_ENDPOINTS.customers.delete(id)),
    onSuccess: () => {
      invalidateQueries.customers();
      toast.success('顧客を削除しました');
    },
    onError: (error: any) => {
      toast.error(`顧客の削除に失敗しました: ${error.message}`);
    },
  });
}

// ============================================
// 制作物関連
// ============================================

export function useWorkOrders() {
  return useQuery({
    queryKey: queryKeys.workOrders,
    queryFn: () => apiRequest<{ work_orders: WorkOrder[] }>(API_ENDPOINTS.workOrders.list),
    select: (data) => data.work_orders,
  });
}

export function useWorkOrder(id: string | null) {
  return useQuery({
    queryKey: queryKeys.workOrder(id || ''),
    queryFn: () => apiRequest<{ work_order: WorkOrder }>(API_ENDPOINTS.workOrders.detail(id || '')),
    select: (data) => data.work_order,
    enabled: !!id,
  });
}

export function useCreateWorkOrder() {
  return useMutation({
    mutationFn: (data: any) => post(API_ENDPOINTS.workOrders.create, data),
    onSuccess: () => {
      invalidateQueries.workOrders();
      invalidateQueries.dashboard();
      toast.success('制作物を作成しました');
    },
    onError: (error: any) => {
      toast.error(`制作物の作成に失敗しました: ${error.message}`);
    },
  });
}

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      put(API_ENDPOINTS.workOrders.update(id), data),
    onSuccess: (_, { id }) => {
      invalidateQueries.workOrders();
      invalidateQueries.dashboard();
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrder(id) });
      toast.success('制作物を更新しました');
    },
    onError: (error: any) => {
      toast.error(`制作物の更新に失敗しました: ${error.message}`);
    },
  });
}

export function useDeleteWorkOrder() {
  return useMutation({
    mutationFn: (id: string) => del(API_ENDPOINTS.workOrders.delete(id)),
    onSuccess: () => {
      invalidateQueries.workOrders();
      invalidateQueries.dashboard();
      toast.success('制作物を削除しました');
    },
    onError: (error: any) => {
      toast.error(`制作物の削除に失敗しました: ${error.message}`);
    },
  });
}

// ============================================
// ユーザー・スタッフ関連
// ============================================

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => apiRequest<{ users: any[] }>(API_ENDPOINTS.users.list),
    select: (data) => data.users,
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => apiRequest<{ user: any }>(API_ENDPOINTS.users.me),
    select: (data) => data.user,
    staleTime: CACHE_CONFIG.user.staleTime,
    gcTime: CACHE_CONFIG.user.gcTime,
    retry: false, // セッション期限切れ時はリトライしない
    enabled: !!localStorage.getItem('access_token'), // トークンがある場合のみ実行
  });
}

// ============================================
// 設定関連
// ============================================

export function useLocations() {
  return useQuery({
    queryKey: queryKeys.locations,
    queryFn: () => apiRequest<{ locations: any[] }>(API_ENDPOINTS.locations.list),
    select: (data) => data.locations,
    staleTime: CACHE_CONFIG.static.staleTime,
    gcTime: CACHE_CONFIG.static.gcTime,
  });
}

export function useMenuItems() {
  return useQuery({
    queryKey: queryKeys.menuItems,
    queryFn: () => apiRequest<{ menu_items: any[] }>(API_ENDPOINTS.menuItems.list),
    select: (data) => data.menu_items,
    staleTime: CACHE_CONFIG.static.staleTime,
    gcTime: CACHE_CONFIG.static.gcTime,
  });
}

// ============================================
// 売上分析
// ============================================

interface SalesAnalyticsParams {
  startDate: string;
  endDate: string;
  viewMode: string;
}

export function useSalesAnalytics(params: SalesAnalyticsParams) {
  return useQuery({
    queryKey: queryKeys.salesAnalytics(params as any),
    queryFn: () => apiRequest(withQuery(API_ENDPOINTS.analytics.sales, params as any)),
    staleTime: CACHE_CONFIG.analytics.staleTime,
    gcTime: CACHE_CONFIG.analytics.gcTime,
  });
}

// ============================================
// インセンティブ
// ============================================

interface IncentivesParams {
  year?: string;
  user_id?: string;
}

export function useIncentives(params: IncentivesParams = {}) {
  return useQuery({
    queryKey: queryKeys.incentives(params as any),
    queryFn: () => apiRequest(withQuery(API_ENDPOINTS.incentives.yearly, params as any)),
    staleTime: CACHE_CONFIG.default.staleTime,
    gcTime: CACHE_CONFIG.default.gcTime,
  });
}

export function useUpdateIncentive() {
  return useMutation({
    mutationFn: (data: any) => post(API_ENDPOINTS.incentives.monthlyLock, data),
    onSuccess: () => {
      invalidateQueries.incentives();
      toast.success('インセンティブを更新しました');
    },
    onError: (error: any) => {
      toast.error(`インセンティブの更新に失敗しました: ${error.message}`);
    },
  });
}

// ============================================
// バッチフェッチ用ヘルパー
// ============================================

/**
 * 複数のクエリを並列実行し、すべての結果を返す
 * ダッシュボードなどで使用
 */
export function useDashboardData() {
  const dashboard = useDashboard();
  const reservations = useReservations();
  const customers = useCustomers();
  const locations = useLocations();
  const users = useUsers();
  const menuItems = useMenuItems();
  
  return {
    dashboard,
    reservations,
    customers,
    locations,
    users,
    menuItems,
    // すべてのクエリがローディング中かどうか
    isLoading: dashboard.isLoading || reservations.isLoading || customers.isLoading || 
               locations.isLoading || users.isLoading || menuItems.isLoading,
    // いずれかのクエリがエラーかどうか
    isError: dashboard.isError || reservations.isError || customers.isError || 
             locations.isError || users.isError || menuItems.isError,
    // いずれかのクエリがフェッチ中かどうか
    isFetching: dashboard.isFetching || reservations.isFetching || customers.isFetching || 
                locations.isFetching || users.isFetching || menuItems.isFetching,
  };
}
