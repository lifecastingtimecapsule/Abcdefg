import { publicAnonKey, functionsBaseUrl } from './supabase/info';
import { createClient } from './supabase/client';
import { toast } from 'sonner@2.0.3';

const BASE_URL = functionsBaseUrl;

// 401エラー時のコールバック（App.tsxから設定）
let onUnauthorizedCallback: (() => void) | null = null;

export function setUnauthorizedCallback(callback: () => void) {
  onUnauthorizedCallback = callback;
}

// ──────────────────────────────────────────────
// トークンキャッシュ（10秒TTL）
// getSession()はIndexedDB/localStorageアクセスが入るため、
// 連続API呼び出し時の重複コストを削減する
// ──────────────────────────────────────────────
let _tokenCache: { value: string; expiresAt: number } | null = null;

export function invalidateTokenCache() {
  _tokenCache = null;
}

/** Supabase セッションを優先し、なければ access_token を返す（結果をキャッシュ） */
export async function getAccessToken(): Promise<string | null> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.value;
  }
  const { data } = await createClient().auth.getSession();
  const token = data?.session?.access_token ?? localStorage.getItem('access_token') ?? null;
  if (token) {
    _tokenCache = { value: token, expiresAt: Date.now() + 10_000 };
  }
  return token;
}

// ──────────────────────────────────────────────
// カレンダープリフェッチ
// ログイン成功直後（CalendarPageのマウント前）に開始し、
// 直列ロードによる遅延をゼロにする
// ──────────────────────────────────────────────
let _calendarPrefetch: { month: string; promise: Promise<any> } | null = null;

/**
 * ログイン直後にトークンを使って /calendar を先行取得する。
 * CalendarPage がマウントされるのを待たず、React レンダリングと並走する。
 */
export function prefetchCalendarData(token: string, month: string) {
  if (_calendarPrefetch?.month === month) return; // 同月は重複しない

  // キャッシュにも即時反映
  _tokenCache = { value: token, expiresAt: Date.now() + 10_000 };

  const url = `${BASE_URL}/calendar?month=${month}`;
  console.log(`[Prefetch] /calendar?month=${month} 開始`);
  const t0 = Date.now();

  _calendarPrefetch = {
    month,
    promise: fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        console.log(`[Prefetch] /calendar 完了 ${Date.now() - t0}ms`);
        return data;
      })
      .catch(err => {
        console.warn(`[Prefetch] /calendar 失敗 ${Date.now() - t0}ms:`, err);
        _calendarPrefetch = null;
        return null;
      }),
  };
}

/**
 * CalendarPage がプリフェッチ結果を消費する（一度取り出したら null に戻す）。
 * 月が一致しない場合は null を返す。
 */
export function consumeCalendarPrefetch(month: string): Promise<any> | null {
  if (_calendarPrefetch?.month === month) {
    const p = _calendarPrefetch.promise;
    _calendarPrefetch = null;
    return p;
  }
  return null;
}

// ──────────────────────────────────────────────
// 共通 API リクエスト
// ──────────────────────────────────────────────
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

      if (response.status === 401) {
        console.warn('[Auth] Session expired - triggering re-authentication');
        localStorage.removeItem('access_token');
        invalidateTokenCache();
        await createClient().auth.signOut();
        if (onUnauthorizedCallback) {
          onUnauthorizedCallback();
        } else {
          toast.error('セッションが切れました。再度ログインしてください。');
          window.location.reload();
        }
        throw new Error('UNAUTHORIZED');
      } else if (response.status >= 500) {
        console.error(`[API] Server error (${response.status}):`, error);
        toast.error(`サーバーエラーが発生しました (${response.status})`);
      } else if (response.status === 403) {
        console.warn('[API] Access denied:', error);
      }

      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const duration = Date.now() - t0;
    console.log(`[API] ${endpoint} ${response.status} ${duration}ms`);
    return data as T;
  } catch (err) {
    const duration = Date.now() - t0;
    if (!(err instanceof Error && err.message === 'UNAUTHORIZED')) {
      console.log(`[API] ${endpoint} error ${duration}ms`, err);
    }
    if (err instanceof TypeError && err.message.includes('fetch')) {
      console.error('[API] Network error:', err);
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
