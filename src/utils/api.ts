import { publicAnonKey, functionsBaseUrl } from './supabase/info';
import { createClient } from './supabase/client';
import { toast } from 'sonner@2.0.3';

const BASE_URL = functionsBaseUrl;

// 401エラー時のコールバック（App.tsxから設定）
let onUnauthorizedCallback: (() => void) | null = null;

export function setUnauthorizedCallback(callback: () => void) {
  onUnauthorizedCallback = callback;
}

/** Supabase セッションを優先し、なければ従来の access_token を返す */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  if (data?.session?.access_token) return data.session.access_token;
  return localStorage.getItem('access_token');
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  
  if (!token) {
    console.warn('[API] No access token found');
    throw new Error('UNAUTHORIZED');
  }
  
  const url = `${BASE_URL}${endpoint}`;
  const t0 = Date.now();

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
      const duration = Date.now() - t0;
      console.log(`[API] ${endpoint} ${response.status} ${duration}ms`);
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      
      // 401エラー時は適切なエラーハンドリング
      if (response.status === 401) {
        console.warn('[Auth] Session expired - triggering re-authentication');
        localStorage.removeItem('access_token');
        await createClient().auth.signOut();
        //���が設定されていれば実行（再ログインモーダル表示など）
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
    const duration = Date.now() - t0;
    console.log(`[API] ${endpoint} ${response.status} ${duration}ms`);
    return data as T;
  } catch (err) {
    const duration = Date.now() - t0;
    console.log(`[API] ${endpoint} error ${duration}ms`, err);
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
