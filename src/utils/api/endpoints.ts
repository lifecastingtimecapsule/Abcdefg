/**
 * APIエンドポイントの一元管理
 * 型安全なエンドポイント生成
 */

export const API_ENDPOINTS = {
  // 認証
  auth: {
    me: '/me',
    login: '/login',
    logout: '/logout',
  },

  // ダッシュボード
  dashboard: '/dashboard',

  // 予約
  reservations: {
    list: '/reservations',
    detail: (id: string) => `/reservations/${id}`,
    create: '/reservations',
    update: (id: string) => `/reservations/${id}`,
    delete: (id: string) => `/reservations/${id}`,
  },

  // 顧客
  customers: {
    list: '/customers',
    detail: (id: string) => `/customers/${id}`,
    create: '/customers',
    update: (id: string) => `/customers/${id}`,
    delete: (id: string) => `/customers/${id}`,
    batchFixAge: '/customers/batch-fix-age',
  },

  // 制作物
  workOrders: {
    list: '/work-orders',
    detail: (id: string) => `/work-orders/${id}`,
    create: '/work-orders',
    update: (id: string) => `/work-orders/${id}`,
    delete: (id: string) => `/work-orders/${id}`,
  },

  // ユーザー・スタッフ
  users: {
    list: '/users',
    detail: (id: string) => `/users/${id}`,
    me: '/users/me',
    create: '/users',
    update: (id: string) => `/users/${id}`,
    delete: (id: string) => `/users/${id}`,
  },

  // メニュー
  menuItems: {
    list: '/menu-items',
    detail: (id: string) => `/menu-items/${id}`,
    create: '/menu-items',
    update: (id: string) => `/menu-items/${id}`,
    delete: (id: string) => `/menu-items/${id}`,
  },

  // ロケーション
  locations: {
    list: '/locations',
    detail: (id: string) => `/locations/${id}`,
    create: '/locations',
    update: (id: string) => `/locations/${id}`,
    delete: (id: string) => `/locations/${id}`,
  },

  // 売上分析
  analytics: {
    sales: '/sales-analytics',
  },

  // インセンティブ
  incentives: {
    yearly: '/incentives/yearly',
    monthlyLock: '/incentives/monthly/lock',
  },
} as const;

/**
 * クエリパラメータを生成
 */
export function buildQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const validParams = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  
  return validParams.length > 0 ? `?${validParams.join('&')}` : '';
}

/**
 * エンドポイントにクエリパラメータを追加
 */
export function withQuery(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined | null>
): string {
  return endpoint + buildQueryString(params);
}
