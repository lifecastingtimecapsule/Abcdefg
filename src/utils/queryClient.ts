import { QueryClient } from '@tanstack/react-query';
import { RETRY_CONFIG, CACHE_CONFIG } from './api/config';

// デフォルトのクエリ設定
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // キャッシュ設定（デフォルト）
      staleTime: CACHE_CONFIG.default.staleTime,
      gcTime: CACHE_CONFIG.default.gcTime,
      
      // リトライ設定
      retry: (failureCount, error: any) => {
        // リトライしないエラー
        if (RETRY_CONFIG.shouldNotRetry(error)) return false;
        // それ以外は最大2回リトライ
        return failureCount < RETRY_CONFIG.maxRetries;
      },
      retryDelay: RETRY_CONFIG.retryDelay,
      
      // エラーハンドリング
      onError: (error: any) => {
        // 認証エラーは既に api/client.ts で処理されているのでスキップ
        if (error?.message === 'UNAUTHORIZED') return;
        
        // その他のエラーはコンソールに記録
        console.error('[Query Error]', error);
      },
      
      // リフェッチ設定
      refetchOnWindowFocus: false, // フォーカス時の自動リフェッチを無効化
      refetchOnMount: true, // マウント時はリフェッチ
      refetchOnReconnect: true, // 再接続時はリフェッチ
    },
    mutations: {
      // ミューテーションのリトライ設定
      retry: false, // ミューテーションは基本的にリトライしない
      
      onError: (error: any) => {
        // 認証エラー以外のエラーはトースト表示
        if (error?.message !== 'UNAUTHORIZED') {
          console.error('[Mutation Error]', error);
        }
      },
    },
  },
});

// クエリキーの定数管理
export const queryKeys = {
  // ダッシュボード
  dashboard: ['dashboard'] as const,
  
  // 予約関連
  reservations: ['reservations'] as const,
  reservation: (id: string) => ['reservations', id] as const,
  todayReservations: ['reservations', 'today'] as const,
  tentativeReservations: ['reservations', 'tentative'] as const,
  
  // 顧客関連
  customers: ['customers'] as const,
  customer: (id: string) => ['customers', id] as const,
  
  // 制作物関連
  workOrders: ['workOrders'] as const,
  workOrder: (id: string) => ['workOrders', id] as const,
  topWorkOrders: ['workOrders', 'top'] as const,
  overdueWorkOrders: ['workOrders', 'overdue'] as const,
  
  // スタッフ・ユーザー関連
  users: ['users'] as const,
  user: (id: string) => ['users', id] as const,
  currentUser: ['users', 'current'] as const,
  
  // 売上分析
  salesAnalytics: (params: Record<string, string>) => ['salesAnalytics', params] as const,
  
  // インセンティブ
  incentives: (params: Record<string, string>) => ['incentives', params] as const,
  
  // 設定関連
  locations: ['locations'] as const,
  menuItems: ['menuItems'] as const,
  
  // 統計
  stats: ['stats'] as const,
} as const;

// キャッシュ無効化のヘルパー
export const invalidateQueries = {
  dashboard: () => queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
  reservations: () => queryClient.invalidateQueries({ queryKey: queryKeys.reservations }),
  workOrders: () => queryClient.invalidateQueries({ queryKey: queryKeys.workOrders }),
  customers: () => queryClient.invalidateQueries({ queryKey: queryKeys.customers }),
  users: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  salesAnalytics: () => queryClient.invalidateQueries({ queryKey: ['salesAnalytics'] }),
  incentives: () => queryClient.invalidateQueries({ queryKey: ['incentives'] }),
  all: () => queryClient.invalidateQueries(),
};
