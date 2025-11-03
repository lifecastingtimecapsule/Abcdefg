import { projectId, publicAnonKey } from '../supabase/info';

/**
 * API設定の一元管理
 */

// 環境変数（Supabaseから提供）
export const API_CONFIG = {
  projectId,
  publicAnonKey,
  baseUrl: `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0`,
  timeout: 30000, // 30秒
} as const;

// APIエンドポイントのプレフィックス
export const API_PREFIX = '/make-server-fe84bde0';

// リトライ設定
export const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  // リトライしないエラー
  shouldNotRetry: (error: Error) => {
    const message = error.message;
    return (
      message === 'UNAUTHORIZED' ||
      message.includes('403') ||
      message === 'REQUEST_TIMEOUT'
    );
  },
} as const;

// キャッシュ設定
export const CACHE_CONFIG = {
  // デフォルト
  default: {
    staleTime: 5 * 60 * 1000, // 5分間fresh
    gcTime: 10 * 60 * 1000, // 10分間保持
  },
  // 頻繁に更新されるデータ（ダッシュボード、統計など）
  frequent: {
    staleTime: 2 * 60 * 1000, // 2分間fresh
    gcTime: 5 * 60 * 1000, // 5分間保持
  },
  // あまり変わらないデータ（設定、マスタなど）
  static: {
    staleTime: 15 * 60 * 1000, // 15分間fresh
    gcTime: 30 * 60 * 1000, // 30分間保持
  },
  // ユーザー情報（ほぼ不変）
  user: {
    staleTime: 30 * 60 * 1000, // 30分間fresh
    gcTime: 60 * 60 * 1000, // 60分間保持
  },
  // 分析データ（キャッシュ重視）
  analytics: {
    staleTime: 10 * 60 * 1000, // 10分間fresh
    gcTime: 30 * 60 * 1000, // 30分間保持
  },
} as const;
