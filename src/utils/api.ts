import { projectId, publicAnonKey } from './supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0`;

// 401エラー時のコールバック（App.tsxから設定）
let onUnauthorizedCallback: (() => void) | null = null;

export function setUnauthorizedCallback(callback: () => void) {
  onUnauthorizedCallback = callback;
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('access_token');
  
  if (!token) {
    throw new Error('Unauthorized - Please login again');
  }
  
  const url = `${BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    
    // 401エラー時は適切なエラーハンドリング
    if (response.status === 401) {
      localStorage.removeItem('access_token');
      
      // コールバックが設定されていれば実行（再ログインモーダル表示など）
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      } else {
        // フォールバック：リロード
        window.location.reload();
      }
    }
    
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data as T;
}
