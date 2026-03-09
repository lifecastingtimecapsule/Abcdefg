/**
 * マスターデータキャッシュ
 *
 * menu-items, locations, users など複数ページで共通利用するデータを
 * モジュールレベルでキャッシュし、ページ切り替え時の再取得を防ぐ。
 *
 * - TTL: 5分（calendarCache と統一）
 * - in-flight デデュープ付き
 * - 変更操作後に invalidate 可能
 */

import { apiRequest } from './api';
import { Location, MenuItem, User } from '../types';

const CACHE_TTL = 5 * 60_000; // 5分

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const store = new Map<string, CacheEntry<any>>();
const inFlight = new Map<string, Promise<any>>();

function isFresh(key: string): boolean {
  const entry = store.get(key);
  return !!entry && Date.now() - entry.ts < CACHE_TTL;
}

async function fetchCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  // キャッシュが新鮮ならそのまま返す
  if (isFresh(key)) return store.get(key)!.data;

  // デデュープ: 同時リクエストを防ぐ
  const flying = inFlight.get(key);
  if (flying) return flying;

  const promise = fetcher()
    .then(data => {
      store.set(key, { data, ts: Date.now() });
      inFlight.delete(key);
      return data;
    })
    .catch(err => {
      inFlight.delete(key);
      throw err;
    });
  inFlight.set(key, promise);
  return promise;
}

/** キャッシュから即座に取得（TTL内のみ）。APIコールなし */
function getCached<T>(key: string): T | null {
  if (isFresh(key)) return store.get(key)!.data;
  return null;
}

// ── 公開API ──────────────────────

export async function fetchLocations(): Promise<Location[]> {
  return fetchCached('locations', async () => {
    const res = await apiRequest('/locations');
    return res.locations ?? [];
  });
}

export function getCachedLocations(): Location[] | null {
  return getCached('locations');
}

export async function fetchMenuItems(): Promise<MenuItem[]> {
  return fetchCached('menu-items', async () => {
    const res = await apiRequest('/menu-items');
    return res.menu_items ?? [];
  });
}

export function getCachedMenuItems(): MenuItem[] | null {
  return getCached('menu-items');
}

export async function fetchUsers(): Promise<User[]> {
  return fetchCached('users', async () => {
    const res = await apiRequest('/users');
    return res.users ?? [];
  }).catch(() => []); // 403時はスタッフ権限 → 空配列
}

export function getCachedUsers(): User[] | null {
  return getCached('users');
}

/** 特定キーのキャッシュを無効化 */
export function invalidateMaster(key: 'locations' | 'menu-items' | 'users'): void {
  store.delete(key);
}

/** 全マスターキャッシュを無効化 */
export function invalidateAllMaster(): void {
  store.clear();
}
