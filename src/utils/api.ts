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
// プリフェッチチェーン
// ログイン直後: /me → /calendar-data を連鎖的に先行取得することで
// CalendarPage のマウント・useEffect 発火を待たず、直列遅延をゼロにする
// ──────────────────────────────────────────────

export interface MeData {
  user: Record<string, unknown>;
  locations: Record<string, unknown>[];
}

export interface CalendarPrefetchResult {
  meData: MeData;
  calendarData: Record<string, unknown>;
}

let _calendarPrefetch: { month: string; promise: Promise<CalendarPrefetchResult | null> } | null = null;

/**
 * ログイン直後にトークンを使って /me → /calendar-data を連鎖的に先行取得する。
 * - Step 1: /me でユーザー情報 + アクセス可能ロケーションを取得
 * - Step 2: /me 完了後、最初の location_id を使って /calendar-data を取得
 *
 * @returns Promise<MeData | null> /me のレスポンス。呼び出し側が await することで
 *   React レンダリングと並走しながらユーザー情報を取得できる。
 *   その間に /calendar-data のフェッチも並走する。
 */
export function startPrefetchChain(token: string, month: string): Promise<MeData | null> {
  // キャッシュにも即時反映
  _tokenCache = { value: token, expiresAt: Date.now() + 10_000 };

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Step 1: /me（user + locations）を先行取得
  const t0 = Date.now();
  console.log('[Prefetch] /me 開始');

  const mePromise: Promise<MeData | null> = fetch(`${BASE_URL}/me`, { headers: authHeaders })
    .then(r => {
      if (!r.ok) throw new Error(`/me: HTTP ${r.status}`);
      return r.json() as Promise<MeData>;
    })
    .then(data => {
      console.log(`[Prefetch] /me 完了 ${Date.now() - t0}ms`);
      return data;
    })
    .catch(err => {
      console.warn('[Prefetch] /me 失敗:', err);
      return null;
    });

  // Step 2: /me 完了後に最初の location_id を使って /calendar-data を先行取得
  _calendarPrefetch = {
    month,
    promise: mePromise.then(async (meData): Promise<CalendarPrefetchResult | null> => {
      if (!meData) return null;

      const firstLocationId = (meData.locations as any[])?.[0]?.location_id as string | undefined;
      const locationParam = firstLocationId ? `&location_id=${firstLocationId}` : '';
      const calUrl = `${BASE_URL}/calendar-data?month=${month}${locationParam}`;

      const t1 = Date.now();
      console.log(`[Prefetch] /calendar-data?month=${month} 開始`);

      return fetch(calUrl, { headers: authHeaders })
        .then(r => {
          if (!r.ok) throw new Error(`/calendar-data: HTTP ${r.status}`);
          return r.json();
        })
        .then(calendarData => {
          console.log(`[Prefetch] /calendar-data 完了 ${Date.now() - t1}ms`);
          return { meData, calendarData };
        })
        .catch(err => {
          console.warn('[Prefetch] /calendar-data 失敗:', err);
          return null;
        });
    }),
  };

  // /me の Promise を返すことで呼び出し側がユーザー情報を即座に取得できる
  return mePromise;
}

/**
 * CalendarPage がプリフェッチ結果を消費する（一度取り出したら null に戻す）。
 * 月が一致しない場合は null を返す。
 */
export function consumeCalendarPrefetch(month: string): Promise<CalendarPrefetchResult | null> | null {
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
