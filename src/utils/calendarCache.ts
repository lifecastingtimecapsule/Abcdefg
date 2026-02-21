/**
 * グローバルカレンダーキャッシュ
 *
 * - モジュールレベルの Map: CalendarPage のアンマウントをまたいで保持
 * - in-flight 追跡: 同じ月への並列フェッチをデデュープ
 * - ログイン後プリフェッチ: 各 locationId × 今月〜±3月 を優先波状フェッチ
 * - キャッシュキー形式: "YYYY-MM:location_id"
 */

import { apiRequest } from './api';
import { Location, MenuItem, User, WorkOrder } from '../types';

export interface CalendarCacheEntry {
  reservations: any[];
  locations: Location[];
  menu_items: MenuItem[];
  users: User[];
  work_orders: WorkOrder[];
  ts: number;
}

const CACHE_TTL = 5 * 60_000; // 5分

// モジュールレベルのキャッシュ（CalendarPage 再マウント時も保持）
const cache = new Map<string, CalendarCacheEntry>();

// 同じキーへの並列フェッチをデデュープする in-flight Map
const inFlight = new Map<string, Promise<CalendarCacheEntry | null>>();

/** Date → "YYYY-MM" */
function toMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** "YYYY-MM" を delta 月ずらした "YYYY-MM" を返す */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return toMonthKey(new Date(y, m - 1 + delta, 1));
}

/** キャッシュキー: "YYYY-MM:location_id" */
function cacheKey(month: string, locationId: string): string {
  return `${month}:${locationId}`;
}

/** API を叩いて 1 ヶ月分のデータを取得する（内部使用） */
async function doFetch(month: string, locationId: string): Promise<CalendarCacheEntry | null> {
  try {
    const data = await apiRequest(`/calendar-data?month=${month}&location_id=${locationId}`) as any;
    return {
      reservations: data.reservations ?? [],
      locations:    data.locations    ?? [],
      menu_items:   data.menu_items   ?? [],
      users:        data.users        ?? [],
      work_orders:  data.work_orders  ?? [],
      ts: Date.now(),
    };
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') throw e;
    console.error('[calendarCache] fetch error:', e);
    return null;
  }
}

/**
 * 指定月・ロケーションのデータをフェッチしてキャッシュに保存する。
 * - TTL 内のキャッシュがあれば API を叩かずに返す
 * - 同じキーが並列でリクエストされた場合は in-flight を共有してデデュープ
 */
export async function fetchAndCacheMonth(
  month: string,
  locationId: string
): Promise<CalendarCacheEntry | null> {
  const key = cacheKey(month, locationId);

  // 新鮮なキャッシュがあれば即返す
  const existing = cache.get(key);
  if (existing && Date.now() - existing.ts < CACHE_TTL) return existing;

  // すでにフェッチ中の場合はそのまま待つ（デデュープ）
  const flying = inFlight.get(key);
  if (flying) return flying;

  // 新規フェッチ開始
  const promise = doFetch(month, locationId)
    .then(entry => {
      inFlight.delete(key);
      if (entry) cache.set(key, entry);
      return entry;
    })
    .catch(err => {
      inFlight.delete(key);
      throw err;
    });
  inFlight.set(key, promise);
  return promise;
}

/**
 * キャッシュから取得（TTL 内のみ返す・API 呼出しなし）。
 * CalendarPage がローディングなしで即表示するために使う。
 */
export function getCachedMonth(month: string, locationId: string): CalendarCacheEntry | null {
  const key = cacheKey(month, locationId);
  const entry = cache.get(key);
  return entry && Date.now() - entry.ts < CACHE_TTL ? entry : null;
}

/**
 * ログイン成功直後に呼ぶ。
 * 各 locationId × 今月〜±3月 の優先順でバックグラウンドプリフェッチを開始する。
 * 呼び出し元をブロックしない（fire-and-forget）。
 */
export function prefetchAfterLogin(locationIds: string[]): void {
  if (locationIds.length === 0) return;
  const current = toMonthKey(new Date());

  (async () => {
    try {
      // Wave 1: 今月（全 locationId、最優先）
      await Promise.all(
        locationIds.map(lid => fetchAndCacheMonth(current, lid).catch(() => null))
      );

      // Wave 2: ±1 ヶ月
      await Promise.all([
        ...locationIds.map(lid => fetchAndCacheMonth(shiftMonth(current, -1), lid).catch(() => null)),
        ...locationIds.map(lid => fetchAndCacheMonth(shiftMonth(current, +1), lid).catch(() => null)),
      ]);

      // Wave 3: ±2 ヶ月
      await Promise.all([
        ...locationIds.map(lid => fetchAndCacheMonth(shiftMonth(current, -2), lid).catch(() => null)),
        ...locationIds.map(lid => fetchAndCacheMonth(shiftMonth(current, +2), lid).catch(() => null)),
      ]);

      // Wave 4: ±3 ヶ月
      await Promise.all([
        ...locationIds.map(lid => fetchAndCacheMonth(shiftMonth(current, -3), lid).catch(() => null)),
        ...locationIds.map(lid => fetchAndCacheMonth(shiftMonth(current, +3), lid).catch(() => null)),
      ]);
    } catch {
      // UNAUTHORIZED などはログインフローに委ねる
    }
  })();
}

/** 全キャッシュを破棄（予約の保存・削除後に使用） */
export function invalidateAll(): void {
  cache.clear();
}
