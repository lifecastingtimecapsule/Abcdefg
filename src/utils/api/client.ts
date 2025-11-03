import { API_CONFIG } from './config';
import { toast } from 'sonner@2.0.3';

/**
 * APIクライアント - 抽象化されたHTTPリクエスト
 */

// 401エラー時のコールバック（App.tsxから設定）
let onUnauthorizedCallback: (() => void) | null = null;

export function setUnauthorizedCallback(callback: () => void) {
  onUnauthorizedCallback = callback;
}

/**
 * タイムアウト付きfetch
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('REQUEST_TIMEOUT');
    }
    throw err;
  }
}

/**
 * レスポンスエラーハンドリング
 */
async function handleResponseError(response: Response): Promise<never> {
  const error = await response.json().catch(() => ({ error: 'Request failed' }));

  // 401エラー時は適切なエラーハンドリング
  if (response.status === 401) {
    console.warn('[Auth] Session expired - triggering re-authentication');
    localStorage.removeItem('access_token');

    // コールバックが設定されていれば実行（再ログインモーダル表示など）
    if (onUnauthorizedCallback) {
      onUnauthorizedCallback();
    } else {
      // フォールバック：リロード
      toast.error('セッションが切れました。再度ログインしてください。');
      window.location.reload();
    }

    throw new Error('UNAUTHORIZED');
  } else if (response.status >= 500) {
    // サーバーエラー
    console.error(`Server error (${response.status}):`, error);
    toast.error(`サーバーエラーが発生しました (${response.status})`);
  } else if (response.status === 403) {
    // 権限エラー
    console.error('Permission denied:', error);
    toast.error('この操作を実行する権限がありません');
  }

  throw new Error(error.error || `HTTP ${response.status}`);
}

/**
 * APIリクエストのオプション
 */
export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: any;
  skipAuth?: boolean;
}

/**
 * 汎用APIリクエスト関数
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { body, skipAuth = false, ...fetchOptions } = options;

  // 認証トークン取得
  const token = localStorage.getItem('access_token');

  if (!skipAuth && !token) {
    console.warn('[API] No access token found');
    throw new Error('UNAUTHORIZED');
  }

  const url = `${API_CONFIG.baseUrl}${endpoint}`;

  try {
    const response = await fetchWithTimeout(
      url,
      {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          ...(skipAuth ? {} : { Authorization: `Bearer ${token}` }),
          ...fetchOptions.headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      API_CONFIG.timeout
    );

    if (!response.ok) {
      await handleResponseError(response);
    }

    const data = await response.json();
    return data as T;
  } catch (err: any) {
    // タイムアウトエラー
    if (err?.message === 'REQUEST_TIMEOUT') {
      console.error('Request timeout:', url);
      toast.error('リクエストがタイムアウトしました。しばらくしてから再試行してください。');
      throw new Error('REQUEST_TIMEOUT');
    }

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

/**
 * GETリクエスト
 */
export async function get<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: 'GET' });
}

/**
 * POSTリクエスト
 */
export async function post<T = any>(
  endpoint: string,
  body?: any,
  options?: ApiRequestOptions
): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: 'POST', body });
}

/**
 * PUTリクエスト
 */
export async function put<T = any>(
  endpoint: string,
  body?: any,
  options?: ApiRequestOptions
): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: 'PUT', body });
}

/**
 * PATCHリクエスト
 */
export async function patch<T = any>(
  endpoint: string,
  body?: any,
  options?: ApiRequestOptions
): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: 'PATCH', body });
}

/**
 * DELETEリクエスト
 */
export async function del<T = any>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: 'DELETE' });
}
