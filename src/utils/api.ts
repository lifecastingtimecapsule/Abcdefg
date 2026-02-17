import { publicAnonKey, functionsBaseUrl } from './supabase/info';
import { toast } from 'sonner@2.0.3';

const BASE_URL = functionsBaseUrl;

// 401エラー時のコールバック（App.tsxから設定）
let onUnauthorizedCallback: (() => void) | null = null;

export function setUnauthorizedCallback(callback: () => void) {
  onUnauthorizedCallback = callback;
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('access_token');
  
  if (!token) {
    console.warn('[API] No access token found');
    throw new Error('UNAUTHORIZED');
  }
  
  const url = `${BASE_URL}${endpoint}`;
  
  try {
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
        console.warn('[Auth] Session expired - triggering re-authentication');
        localStorage.removeItem('access_token');
        
        // コールバッ���が設定されていれば実行（再ログインモーダル表示など）
        if (onUnauthorizedCallback) {
          onUnauthorizedCallback();
        } else {
          // フォールバック：リロード
          toast.error('セッションが切れました。再度ログインしてください。');
          window.location.reload();
        }
        
        // 401エラーは例外をスローせず、再認証フローに委ねる
        throw new Error('UNAUTHORIZED');
      } else if (response.status >= 500) {
        // サーバーエラー
        console.error(`Server error (${response.status}):`, error);
        toast.error(`サーバーエラーが発生しました (${response.status})`);
      } else if (response.status === 403) {
        // 権限エラー（トーストは表示せず、コンソールログのみ）
        console.warn('[Permission] Access denied:', error);
      }
      
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data as T;
  } catch (err) {
    // ネットワークエラーなど
    if (err instanceof TypeError && err.message.includes('fetch')) {
      console.error('Network error:', err);
      toast.error('ネットワークエラーが発生しました。接続を確認してください。', {
        action: {
          label: '再試行',
          onClick: () => window.location.reload(),
        },
      });
    }
    throw err;
  }
}
