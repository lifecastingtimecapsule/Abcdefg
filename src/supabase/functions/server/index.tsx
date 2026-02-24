import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs';
import * as jose from 'npm:jose';
import * as db from './db.ts';
import { syncToGoogleCalendar } from './google_calendar.tsx';

const app = new Hono();

const JWT_SECRET = Deno.env.get('JWT_SECRET') || '';
const SALT_ROUNDS = 10;
// セキュリティ: 有効期限は短めに。環境変数 JWT_EXPIRY で上書き可能（例: 30m, 1h）。デフォルト 30 分
const JWT_EXPIRY = Deno.env.get('JWT_EXPIRY') || '30m';

app.use('*', cors());
app.use('*', logger(console.log));

// ========== In-memory cache (TTL 5 min) ==========
interface CacheEntry<T> { data: T; expiresAt: number; }
const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL = 5 * 60 * 1000; // 5分

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}
function cacheSet<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}
function cacheInvalidate(...keys: string[]): void {
  keys.forEach(k => cache.delete(k));
}

async function getCachedLocations() {
  const cached = cacheGet<Record<string, unknown>[]>('locations');
  if (cached) return cached;
  const data = await db.getLocations();
  cacheSet('locations', data);
  return data;
}
async function getCachedMenuItems() {
  const cached = cacheGet<Record<string, unknown>[]>('menu_items');
  if (cached) return cached;
  const data = await db.getMenuItems();
  cacheSet('menu_items', data);
  return data;
}
async function getCachedUsers() {
  const cached = cacheGet<Record<string, unknown>[]>('users');
  if (cached) return cached;
  const data = await db.getAppUsers();
  cacheSet('users', data);
  return data;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Default admin credentials (固定の初期アカウント情報)
const DEFAULT_ADMIN = {
  email: 'admin@amaretto.local',
  password: 'amaretto2024',
  login_id: 'admin',
  name: '管理者',
};

// 全ユーザーに一括発行する初期パスワード（password_hash が null のユーザー用）。ログイン後は必ず変更させる。
const INITIAL_PASSWORD = 'InitialPassword1!';

function sanitizeUserForResponse(u: Record<string, unknown>): Record<string, unknown> {
  const { password_hash, ...rest } = u;
  return rest;
}

// ========== Auth Helpers ==========
async function getAuthUser(request: Request): Promise<{ id: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  const accessToken = authHeader.split(' ')[1];
  if (!accessToken) return null;

  const supabaseUser = await supabase.auth.getUser(accessToken);
  if (supabaseUser.data?.user) {
    return supabaseUser.data.user;
  }
  if (JWT_SECRET) {
    try {
      const { payload } = await jose.jwtVerify(
        accessToken,
        new TextEncoder().encode(JWT_SECRET),
        { algorithms: ['HS256'] }
      );
      const sub = payload.sub;
      if (sub) return { id: sub };
    } catch (_) {
      // not our JWT or invalid
    }
  }
  return null;
}

async function getUserRole(userId: string) {
  const userData = await db.getAppUser(userId);
  return (userData?.role as string) || null;
}

// ========== Auth Routes ==========

// Login with login_id（password_hash + bcrypt のみ。自前 JWT 発行。Supabase Auth は呼ばない）
app.post('/make-server-fe84bde0/login', async (c) => {
  const t0 = Date.now();
  try {
    const body = await c.req.json();
    const { login_id, password } = body;

    const user = await db.getAppUserByLoginId(login_id);
    const tUser = Date.now();

    if (!user) {
      console.log(`[Perf] POST /login userLookupMs=${tUser - t0} totalMs=${Date.now() - t0} result=user_not_found`);
      return c.json({ error: 'ログインIDまたはパスワードが正しくありません' }, 401);
    }
    if (user.active_flag === false) {
      console.log(`[Perf] POST /login userLookupMs=${tUser - t0} totalMs=${Date.now() - t0} result=account_disabled`);
      return c.json({ error: 'このアカウントは無効です' }, 403);
    }

    // A のみ: password_hash が必須。未設定の場合はログイン不可（Supabase Auth フォールバックは廃止）
    if (!user.password_hash) {
      console.log(`[Perf] POST /login userLookupMs=${tUser - t0} totalMs=${Date.now() - t0} result=password_not_set`);
      return c.json({ error: 'このアカウントはパスワードが未設定です。管理者にパスワード設定を依頼してください。' }, 403);
    }
    if (!JWT_SECRET) {
      console.log(`[Perf] POST /login JWT_SECRET not configured`);
      return c.json({ error: '認証の設定が完了していません。管理者に連絡してください。' }, 503);
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    const tBcrypt = Date.now();
    if (!ok) {
      console.log(`[Perf] POST /login userLookupMs=${tUser - t0} bcryptMs=${tBcrypt - tUser} totalMs=${Date.now() - t0} result=wrong_password`);
      return c.json({ error: 'ログインIDまたはパスワードが正しくありません' }, 401);
    }

    const secret = new TextEncoder().encode(JWT_SECRET);
    const accessToken = await new jose.SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.user_id)
      .setIssuedAt()
      .setExpirationTime(JWT_EXPIRY)
      .sign(secret);
    const tJwt = Date.now();

    // 認証成功後は即座にトークンを返し、last_login_at 更新は非同期で実行（応答を遅らせない）
    db.upsertAppUser({
      ...user,
      last_login_at: new Date().toISOString(),
    }).catch((updateError) => {
      console.log(`Failed to update last login time: ${updateError}`);
    });
    const tEnd = Date.now();
    const userLookupMs = tUser - t0;
    const bcryptMs = tBcrypt - tUser;
    const jwtMs = tJwt - tBcrypt;
    const totalMs = tEnd - t0;
    console.log(`[Perf] POST /login userLookupMs=${userLookupMs} bcryptMs=${bcryptMs} jwtMs=${jwtMs} totalMs=${totalMs} result=success`);
    return c.json({
      success: true,
      access_token: accessToken,
      user: sanitizeUserForResponse({
        ...user,
        created_at: user.created_at || new Date().toISOString(),
        updated_at: user.updated_at || new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.log(`[Perf] POST /login totalMs=${Date.now() - t0} result=error`);
    console.log(`Login processing error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Sign up
app.post('/make-server-fe84bde0/signup', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, name, role, login_id } = body;

    if (!login_id) {
      return c.json({ error: 'ログインIDが必要です' }, 400);
    }

    // Validate password length
    if (!password || password.length < 6) {
      return c.json({ error: 'パスワードは6文字以上で設定してください' }, 400);
    }

    const existingByLogin = await db.getAppUserByLoginId(login_id);
    if (existingByLogin) {
      return c.json({ error: 'このログインIDは既に使用されています' }, 400);
    }

    // Create user in Supabase Auth
    // Automatically confirm the user's email since an email server hasn't been configured.
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      console.log(`Sign up error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    const userId = data.user.id;

    await db.upsertAppUser({
      user_id: userId,
      name,
      email,
      login_id,
      role: role || 'staff',
      active_flag: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return c.json({ success: true, user_id: userId });
  } catch (error) {
    console.log(`Sign up processing error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get current user
app.get('/make-server-fe84bde0/me', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userData = await db.getAppUser(user.id);
    if (!userData) {
      console.error(`[/me] User data not found for: ${user.id}`);
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user: sanitizeUserForResponse(userData) });
  } catch (error) {
    console.error(`[/me] Error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Change my password（自分用。初期パスワード変更時に使用。成功で must_change_password を false に）
app.post('/make-server-fe84bde0/me/change-password', async (c) => {
  try {
    const authUser = await getAuthUser(c.req.raw);
    if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const { current_password, new_password } = body;
    if (!current_password || !new_password) {
      return c.json({ error: '現在のパスワードと新しいパスワードを入力してください' }, 400);
    }
    if (new_password.length < 6) {
      return c.json({ error: '新しいパスワードは6文字以上で設定してください' }, 400);
    }

    const userData = await db.getAppUser(authUser.id);
    if (!userData) return c.json({ error: 'User not found' }, 404);
    if (!userData.password_hash) {
      return c.json({ error: 'パスワード認証が設定されていません。管理者に連絡してください。' }, 400);
    }

    const ok = await bcrypt.compare(current_password, userData.password_hash as string);
    if (!ok) {
      return c.json({ error: '現在のパスワードが正しくありません' }, 401);
    }

    const newHash = await bcrypt.hash(new_password, SALT_ROUNDS);
    const updated = {
      ...userData,
      password_hash: newHash,
      must_change_password: false,
      updated_at: new Date().toISOString(),
    };
    await db.upsertAppUser(updated);
    return c.json({ success: true, user: sanitizeUserForResponse(updated) });
  } catch (error) {
    console.error(`[/me/change-password] Error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Issue initial passwords for all users with null password_hash（管理者のみ。実行後、全員が初期パスワードでログイン可能になり、初回ログイン時に変更を促す）
app.post('/make-server-fe84bde0/admin/issue-initial-passwords', async (c) => {
  try {
    const authUser = await getAuthUser(c.req.raw);
    if (!authUser) return c.json({ error: 'Unauthorized' }, 401);
    if (await getUserRole(authUser.id) !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const users = await db.getAppUsers();
    let updated = 0;
    const hash = await bcrypt.hash(INITIAL_PASSWORD, SALT_ROUNDS);
    for (const u of users) {
      if (u.password_hash) continue;
      await db.upsertAppUser({
        ...u,
        password_hash: hash,
        must_change_password: true,
        updated_at: new Date().toISOString(),
      });
      updated++;
    }
    return c.json({
      success: true,
      updated,
      total: users.length,
      initial_password: INITIAL_PASSWORD,
      message: `パスワードが未設定だった ${updated} 件のユーザーに初期パスワードを設定しました。ログイン後、必ずパスワードを変更してください。`,
    });
  } catch (error) {
    console.error(`[/admin/issue-initial-passwords] Error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Initialize system - Create default admin account (初回セットアップ用)
app.post('/make-server-fe84bde0/initialize', async (c) => {
  try {
    console.log('System initialization requested...');
    
    // Check if any users exist（既に初期化済みの場合は 200 で返し、フロントの「失敗」扱いを防ぐ）
    const users = await db.getAppUsers();
    if (users.length > 0) {
      return c.json({ 
        success: true, 
        already_initialized: true, 
        message: 'システムは既に初期化されています。',
        existing_users: users.length 
      }, 200);
    }
    
    console.log('Creating default admin account...');
    
    // Try to get existing user by email first
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingAdmin = existingUsers?.users?.find(u => u.email === DEFAULT_ADMIN.email);
    
    let userId: string;
    
    if (existingAdmin) {
      // Admin user exists in Auth but not in KV - recover it
      console.log('Admin user exists in Auth, recovering to KV store...');
      userId = existingAdmin.id;
      
      // Update password to ensure it matches default
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        userId,
        { password: DEFAULT_ADMIN.password }
      );
      
      if (updateError) {
        console.error(`Failed to update admin password: ${updateError.message}`);
      }
    } else {
      // Create admin user in Supabase Auth
      const { data, error } = await supabase.auth.admin.createUser({
        email: DEFAULT_ADMIN.email,
        password: DEFAULT_ADMIN.password,
        email_confirm: true,
      });
      
      if (error) {
        console.error(`Failed to create admin account: ${error.message}`);
        return c.json({ error: `管理者アカウントの作成に失敗しました: ${error.message}` }, 500);
      }
      
      userId = data.user.id;
    }
    
    await db.upsertAppUser({
      user_id: userId,
      name: DEFAULT_ADMIN.name,
      email: DEFAULT_ADMIN.email,
      login_id: DEFAULT_ADMIN.login_id,
      role: 'admin',
      active_flag: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log('✅ Default admin account created successfully!');

    // Create default location (豊川店)
    const locationId = crypto.randomUUID();
    await db.upsertLocation({
      location_id: locationId,
      location_name: '豊川店',
      address_text: '',
      phone: '',
      active_flag: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log('✅ Default location (豊川店) created successfully!');

    // Create default menu items
    const defaultMenuItems = [
      {
        name: 'お好きな部位一本+写真',
        base_price: 15000,
        additional_unit_price: 5000,
        description: '部位の追加は一本当たり5,000円',
        is_active: true,
      },
      {
        name: 'お好きな部位二本+写真',
        base_price: 20000,
        additional_unit_price: 5000,
        description: '部位の追加は一本当たり5,000円',
        is_active: true,
      },
      {
        name: 'ご家族全員の手+写真',
        base_price: 25000,
        additional_unit_price: 5000,
        description: '家族全員の手形を残せます',
        is_active: true,
      },
    ];

    for (const menuItem of defaultMenuItems) {
      const menuId = crypto.randomUUID();
      await db.upsertMenuItem({
        menu_item_id: menuId,
        ...menuItem,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    console.log('✅ Default menu items created successfully!');
    
    return c.json({ 
      success: true,
      message: '初期管理者アカウントが作���されました',
      login_info: {
        login_id: DEFAULT_ADMIN.login_id,
        note: 'パスワードはSETUP.mdを参照してください'
      }
    });
    
  } catch (error) {
    console.error(`System initialization error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// 既存ユーザーに user_login を一括設定（ログインは app_users.login_id で行うため、本エンドポイントは互換用）
app.post('/make-server-fe84bde0/admin/backfill-user-login', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (await getUserRole(user.id) !== 'admin') return c.json({ error: 'Admin access required' }, 403);
    const users = await db.getAppUsers();
    return c.json({ success: true, updated: 0, total: users.length, note: 'Login is via app_users.login_id' });
  } catch (error) {
    console.log(`Backfill user_login error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Users ==========

// Get all users
app.get('/make-server-fe84bde0/users', async (c) => {
  const t0 = Date.now();
  try {
    const user = await getAuthUser(c.req.raw);
    const tAuth = Date.now();
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    const allUsers = await db.getAppUsers();
    const activeUsers = allUsers.filter((u: any) => u.active_flag !== false);
    const tEnd = Date.now();
    console.log(`[Perf] GET /users authMs=${tAuth - t0} dbMs=${tEnd - tAuth} totalMs=${tEnd - t0} count=${activeUsers.length}`);

    // スタッフ権限の場合は限定された情報のみを返す
    if (role !== 'admin') {
      const limitedUsers = activeUsers.map((u: any) => ({
        user_id: u.user_id,
        login_id: u.login_id,
        name: u.name,
        role: u.role, // roleを含める（担当スタッフ選択時の管理者除外用）
      }));
      return c.json({ users: limitedUsers });
    }

    // 管理者の場合は全情報を返す
    return c.json({ users: activeUsers });
  } catch (error) {
    console.log(`Get users error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Update user (admin only)
app.post('/make-server-fe84bde0/users/update', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const body = await c.req.json();
    const { user_id, name, role: newRole, active_flag, update_login_id, update_password } = body;

    if (!user_id) {
      return c.json({ error: 'user_id is required' }, 400);
    }

    const userData = await db.getAppUser(user_id);
    if (!userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Check if new login_id is unique (if provided)
    if (update_login_id && update_login_id !== userData.login_id) {
      const existingByLogin = await db.getAppUserByLoginId(update_login_id);
      const existingUser = existingByLogin && (existingByLogin as any).user_id !== user_id ? existingByLogin : null;
      if (existingUser) {
        return c.json({ error: 'このログインIDは既に使用されています' }, 400);
      }
    }

    // Update user in KV store
    const updatedUser = {
      ...userData,
      name: name !== undefined ? name : userData.name,
      role: newRole !== undefined ? newRole : userData.role,
      active_flag: active_flag !== undefined ? active_flag : userData.active_flag,
      login_id: update_login_id || userData.login_id,
      updated_at: new Date().toISOString(),
    };

    await db.upsertAppUser(updatedUser);

    // Update password if provided
    if (update_password) {
      if (update_password.length < 6) {
        return c.json({ error: 'パスワードは6文字以上で設定してください' }, 400);
      }
      try {
        await supabase.auth.admin.updateUserById(user_id, { password: update_password });
        updatedUser.password_hash = await bcrypt.hash(update_password, SALT_ROUNDS);
        updatedUser.must_change_password = false;
      } catch (pwError) {
        console.error(`Failed to update password: ${pwError}`);
        return c.json({ error: 'パスワードの��新に失敗しました' }, 500);
      }
    }

    await db.upsertAppUser(updatedUser);
    cacheInvalidate('users');
    return c.json({ success: true, user: sanitizeUserForResponse(updatedUser) });
  } catch (error) {
    console.log(`Update user error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Delete user (admin only)
app.delete('/make-server-fe84bde0/users/:user_id', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const userId = c.req.param('user_id');
    if (!userId) {
      return c.json({ error: 'user_id is required' }, 400);
    }

    // Don't allow deleting yourself
    if (userId === user.id) {
      return c.json({ error: '自分自身を削除することはできません' }, 400);
    }

    const userData = await db.getAppUser(userId);
    if (!userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Soft delete - set active_flag to false
    const updatedUser = {
      ...userData,
      active_flag: false,
      updated_at: new Date().toISOString(),
    };

    await db.upsertAppUser(updatedUser);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Delete user error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Locations ==========

// Get all locations
app.get('/make-server-fe84bde0/locations', async (c) => {
  const t0 = Date.now();
  try {
    const user = await getAuthUser(c.req.raw);
    const tAuth = Date.now();
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const locations = await db.getLocations();
    const tEnd = Date.now();
    console.log(`[Perf] GET /locations authMs=${tAuth - t0} dbMs=${tEnd - tAuth} totalMs=${tEnd - t0} count=${locations.length}`);
    return c.json({ locations: locations.filter((l: any) => l.active_flag !== false) });
  } catch (error) {
    console.log(`Get locations error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Create/Update location (admin only)
app.post('/make-server-fe84bde0/locations', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const body = await c.req.json();
    const { location_id, location_name, address_text, phone } = body;

    const locationData = {
      location_id: location_id || crypto.randomUUID(),
      location_name,
      address_text,
      phone,
      active_flag: true,
      created_at: body.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.upsertLocation(locationData);
    cacheInvalidate('locations');
    return c.json({ success: true, location: locationData });
  } catch (error) {
    console.log(`Create/Update location error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Customers ==========

// Get all customers with pagination and search
app.get('/make-server-fe84bde0/customers', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get pagination parameters
    const page = parseInt(c.req.query('page') || '1');
    const pageSizeParam = c.req.query('pageSize');
    const pageSize = pageSizeParam ? parseInt(pageSizeParam) : null; // null means no pagination
    const search = c.req.query('search')?.toLowerCase() || '';

    // Get all active customers
    let customers = await db.getCustomers({ activeOnly: false });
    customers = customers.filter((cust: any) => cust.active_flag !== false);

    // Apply search filter if provided
    if (search) {
      customers = customers.filter((cust: any) => {
        const searchFields = [
          cust.customer_code,
          cust.external_customer_number,
          cust.parent_name,
          cust.parent_name_kana,
          cust.child_name,
          cust.child_name_kana,
          cust.phone,
          cust.postal_code,
          cust.address_text,
        ].filter(Boolean).map(field => String(field).toLowerCase());
        
        // Search in children array if exists
        if (cust.children && Array.isArray(cust.children)) {
          cust.children.forEach((child: any) => {
            if (child.name) searchFields.push(child.name.toLowerCase());
            if (child.name_kana) searchFields.push(child.name_kana.toLowerCase());
          });
        }
        
        return searchFields.some(field => field.includes(search));
      });
    }

    // Sort by created_at desc (newest first)
    customers.sort((a: any, b: any) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

    // Get total count before pagination
    const total = customers.length;

    // Apply pagination if pageSize is specified
    let resultCustomers = customers;
    if (pageSize !== null) {
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      resultCustomers = customers.slice(startIndex, endIndex);
      
      return c.json({ 
        customers: resultCustomers,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      });
    }

    // Return all customers without pagination metadata
    return c.json({ customers: resultCustomers });
  } catch (error) {
    console.log(`Get customers error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Search customer by phone, code, or name
app.get('/make-server-fe84bde0/customers/search', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const phone = c.req.query('phone');
    const code = c.req.query('code');
    const name = c.req.query('name');
    
    const customers = await db.getCustomers({ activeOnly: false });
    let found = customers.filter((cust: any) => cust.active_flag !== false);
    
    if (phone) {
      found = found.filter((cust: any) => cust.phone === phone);
    } else if (code) {
      found = found.filter((cust: any) => cust.customer_code && cust.customer_code.toLowerCase() === code.toLowerCase());
    } else if (name) {
      const searchName = name.toLowerCase();
      found = found.filter((cust: any) => 
        (cust.child_name && cust.child_name.toLowerCase().includes(searchName)) ||
        (cust.parent_name && cust.parent_name.toLowerCase().includes(searchName)) ||
        (cust.child_name_kana && cust.child_name_kana.toLowerCase().includes(searchName)) ||
        (cust.parent_name_kana && cust.parent_name_kana.toLowerCase().includes(searchName)) ||
        (cust.children && Array.isArray(cust.children) && cust.children.some((child: any) => 
          (child.name && child.name.toLowerCase().includes(searchName)) || 
          (child.name_kana && child.name_kana.toLowerCase().includes(searchName))
        ))
      );
    }
    
    return c.json({ customers: found });
  } catch (error) {
    console.log(`Search customer error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Create/Update customer
app.post('/make-server-fe84bde0/customers', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { 
      customer_id, 
      parent_name, 
      parent_name_kana,
      child_name, 
      child_name_kana,
      child_age_years,
      child_age_months,
      children, // New field for multiple children
      phone,
      email,
      line_url,
      postal_code, 
      address_text, 
      notes_internal,
      external_customer_number
    } = body;

    let customerId = customer_id;
    let customerCode = body.customer_code;
    let createdAt = body.created_at;

    if (!customerId) {
      customerId = crypto.randomUUID();
      // Generate customer code (A-1001, A-1002, etc.)
      const allCustomers = await db.getCustomers({ activeOnly: false });
      const maxCode = allCustomers.reduce((max: number, c: any) => {
        const match = c.customer_code?.match(/A-(\d+)/);
        if (match) {
          const num = parseInt(match[1]);
          return num > max ? num : max;
        }
        return max;
      }, 1000);
      customerCode = `A-${maxCode + 1}`;
      createdAt = new Date().toISOString();
    } else {
      // Updating existing customer - preserve existing code and created_at
      const existingCustomer = await db.getCustomer(customerId);
      if (existingCustomer) {
        customerCode = existingCustomer.customer_code;
        createdAt = existingCustomer.created_at;
      }
    }

    // 月齢が入力されていて歳が空の場合は0をセット
    let finalAgeYears = child_age_years !== null && child_age_years !== undefined ? child_age_years : null;
    const hasMonths = child_age_months !== null && child_age_months !== undefined;
    if (finalAgeYears === null && hasMonths) {
      finalAgeYears = 0;
    }

    const customerData = {
      customer_id: customerId,
      customer_code: customerCode,
      external_customer_number: external_customer_number || null,
      parent_name,
      parent_name_kana: parent_name_kana || null,
      child_name,
      child_name_kana: child_name_kana || null,
      child_age_years: finalAgeYears,
      child_age_months: hasMonths ? child_age_months : null,
      children: children || [], // Save children array
      phone,
      email: email || null,
      line_url: line_url || null,
      postal_code,
      address_text,
      notes_internal,
      active_flag: true,
      created_at: createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.upsertCustomer(customerData);

    // Audit log
    await db.insertAuditLog({
      ref_table: 'customers',
      ref_id: customerId,
      action_type: customer_id ? 'update' : 'create',
      after_json: customerData,
      acted_by_user_id: user.id,
      acted_at: new Date().toISOString(),
    });

    return c.json({ success: true, customer: customerData });
  } catch (error) {
    console.log(`Create/Update customer error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Batch update customer age data (admin only)
// 既存顧客データで月齢が入力されているが child_age_years が null のレコードを 0 に更新
app.post('/make-server-fe84bde0/customers/batch-fix-age', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const customers = await db.getCustomers({ activeOnly: false });
    let updatedCount = 0;
    const updatedCustomers = [];

    for (const customer of customers) {
      // 月齢が入力されていて child_age_years が null または undefined の場合
      const hasMonths = customer.child_age_months !== null && customer.child_age_months !== undefined;
      const hasNoYears = customer.child_age_years === null || customer.child_age_years === undefined;
      
      if (hasMonths && hasNoYears) {
        customer.child_age_years = 0;
        customer.updated_at = new Date().toISOString();
        await db.upsertCustomer(customer);
        updatedCount++;
        updatedCustomers.push({
          customer_id: customer.customer_id,
          customer_code: customer.customer_code,
          child_name: customer.child_name,
          child_age_months: customer.child_age_months,
        });

        console.log(`Fixed customer ${customer.customer_code}: set child_age_years to 0 (has ${customer.child_age_months} months)`);
      }
    }

    return c.json({ 
      success: true, 
      updated_count: updatedCount,
      updated_customers: updatedCustomers,
      message: `${updatedCount}件の顧客データを補完しました（月齢のみ入力されていたレコードに child_age_years = 0 を設定）`
    });
  } catch (error) {
    console.log(`Batch fix customer age error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Reservations ==========

/** 指定した予約リストに対して、不足している制作物を自動作成する（N+1解消版） */
async function ensureWorkOrdersForReservations(
  reservations: Record<string, unknown>[],
  user: { id: string }
): Promise<void> {
  if (reservations.length === 0) return;

  const now = new Date();
  const japanNow = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000);

  // 確定済みかつ過去の予約だけに絞る
  const targetReservations = reservations.filter((r: any) => {
    if (r.status !== 'confirmed') return false;
    return new Date(r.reservation_date_time as string) < japanNow;
  });
  if (targetReservations.length === 0) return;

  const reservationIds = targetReservations.map((r: any) => r.reservation_id as string);

  // 全件ではなく対象予約IDだけで work_orders を検索（N+1解消）
  const [existingWOs, menuItems] = await Promise.all([
    db.getWorkOrdersByReservationIds(reservationIds),
    getCachedMenuItems(),
  ]);

  const existingSet = new Set(existingWOs.map(wo => wo.reservation_id));
  const menuById = new Map<string, { name?: string }>();
  for (const m of menuItems as { menu_item_id: string; name?: string }[]) {
    menuById.set(m.menu_item_id, m);
  }

  const toCreate = targetReservations.filter((r: any) => !existingSet.has(r.reservation_id as string));
  if (toCreate.length === 0) return;

  // 並列で一括作成
  await Promise.all(toCreate.map((reservation: any) => {
    const workRequired = (reservation.work_required as string)?.trim();
    const productType = workRequired
      ? workRequired
      : (menuById.get(reservation.menu_item_id as string)?.name) || 'メニュー不明';
    const reservationDate = new Date(reservation.reservation_date_time as string);
    const dueDate = new Date(reservationDate);
    dueDate.setDate(dueDate.getDate() + 28);
    return db.upsertWorkOrder({
      work_order_id: crypto.randomUUID(),
      reservation_id: reservation.reservation_id,
      product_type: productType,
      status: '制作中',
      due_date: dueDate.toISOString().split('T')[0],
      delivered_date: null,
      priority_order: null,
      notes_internal: '予約確定により自動作成',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by_user_id: user.id,
    });
  }));
}

// Get reservations（optional: ?month=YYYY-MM or ?start=YYYY-MM-DD&end=YYYY-MM-DD で範囲指定）
// month/範囲指定時は「必要なら制作物を自動作成してから」顧客名付きで返す（GET 1回で完結、ウォーターフォール解消）
app.get('/make-server-fe84bde0/reservations', async (c) => {
  const t0 = Date.now();
  try {
    const user = await getAuthUser(c.req.raw);
    const tAuth = Date.now();
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const month = c.req.query('month');
    const start = c.req.query('start');
    const end = c.req.query('end');
    const customerIds = c.req.query('customer_ids');

    // 顧客IDリスト指定（顧客ページ用。全件取得を避ける）
    if (customerIds) {
      const ids = customerIds.split(',').filter(Boolean);
      const reservations = await db.getReservationsByCustomerIds(ids);
      return c.json({ reservations });
    }

    let reservations: Record<string, unknown>[];
    if (month) {
      const [y, m] = month.split('-').map(Number);
      const startDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
      const endDate = new Date(y, m, 0, 23, 59, 59, 999);
      reservations = await db.getReservationsByDateRange(startDate, endDate);
    } else if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      reservations = await db.getReservationsByDateRange(startDate, endDate);
    } else {
      reservations = await db.getReservations();
    }
    const tDb = Date.now();

    // 月/範囲指定時: 制作物を自動作成してから返す（フロントの GET→POST→GET を不要に）
    if (month || (start && end)) {
      await ensureWorkOrdersForReservations(reservations, user);
    }
    const tEnsure = Date.now();

    // 月/範囲指定時は顧客名・顧客番号を付与（カレンダー用）
    if ((month || (start && end)) && reservations.length > 0) {
      const customerIds = [...new Set(reservations.map((r: any) => r.customer_id).filter(Boolean))];
      const customers = await db.getCustomersByIds(customerIds);
      const customerMap = Object.fromEntries((customers as any[]).map(c => [c.customer_id, c]));
      reservations = reservations.map((r: any) => {
        const cust = customerMap[r.customer_id];
        const customer_name = cust ? (cust.child_name || cust.parent_name || '名称未設定') : '顧客不明';
        const external_customer_number = cust?.external_customer_number ?? '';
        return { ...r, customer_name, external_customer_number };
      });
    }
    const tEnd = Date.now();
    console.log(`[Perf] GET /reservations authMs=${tAuth - t0} dbMs=${tDb - tAuth} ensureMs=${tEnsure - tDb} enrichMs=${tEnd - tEnsure} totalMs=${tEnd - t0} count=${reservations.length} query=${month || (start && end ? 'range' : 'all')}`);

    return c.json({ reservations });
  } catch (error) {
    console.log(`Get reservations error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== カレンダー専用 API（1リクエストで全データを返す） ==========
const calendarHandler = async (c: any) => {
  const t0 = Date.now();
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    const tAuth = Date.now();

    const month = c.req.query('month');
    if (!month) return c.json({ error: 'month parameter is required (YYYY-MM)' }, 400);

    const [y, m] = month.split('-').map(Number);
    const startDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(y, m, 0, 23, 59, 59, 999);

    const [reservationsRaw, locations, menuItems, allUsers] = await Promise.all([
      db.getReservationsByDateRange(startDate, endDate),
      getCachedLocations(),
      getCachedMenuItems(),
      getCachedUsers(),
    ]);
    const tFetch = Date.now();

    await ensureWorkOrdersForReservations(reservationsRaw, user);
    const tEnsure = Date.now();

    let reservations: Record<string, unknown>[] = reservationsRaw;
    if (reservationsRaw.length > 0) {
      const customerIds = [...new Set(reservationsRaw.map((r: any) => r.customer_id).filter(Boolean))];
      const customers = await db.getCustomersByIds(customerIds as string[]);
      const customerMap = Object.fromEntries((customers as any[]).map((c: any) => [c.customer_id, c]));
      reservations = reservationsRaw.map((r: any) => {
        const cust = customerMap[r.customer_id];
        return {
          ...r,
          customer_name: cust ? (cust.child_name || cust.parent_name || '名称未設定') : '顧客不明',
          external_customer_number: cust?.external_customer_number ?? '',
        };
      });
    }

    const currentAppUser = (allUsers as any[]).find((u: any) => u.user_id === user.id);
    const role = currentAppUser?.role || null;
    const users = role !== 'admin'
      ? (allUsers as any[]).filter((u: any) => u.active_flag !== false).map((u: any) => ({
          user_id: u.user_id, login_id: u.login_id, name: u.name, role: u.role,
        }))
      : (allUsers as any[]).filter((u: any) => u.active_flag !== false);

    const tEnd = Date.now();
    console.log(`[Perf] GET /calendar month=${month} authMs=${tAuth - t0} fetchMs=${tFetch - tAuth} ensureMs=${tEnsure - tFetch} enrichMs=${tEnd - tEnsure} totalMs=${tEnd - t0}`);

    return c.json({
      reservations,
      locations: (locations as any[]).filter((l: any) => l.active_flag !== false),
      menu_items: menuItems,
      users,
    });
  } catch (error) {
    console.log(`Get calendar error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
};
app.get('/make-server-fe84bde0/calendar', calendarHandler);
app.get('/calendar', calendarHandler);

// 予約1件の詳細取得（モーダル用：顧客・場所・メニュー含む）
app.get('/make-server-fe84bde0/reservations/:id', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const reservationId = c.req.param('id');
    const reservation = await db.getReservation(reservationId);
    if (!reservation) {
      return c.json({ error: 'Not found' }, 404);
    }
    const [customer, location, menuItem, users] = await Promise.all([
      (reservation as any).customer_id ? db.getCustomer((reservation as any).customer_id) : null,
      (reservation as any).location_id ? db.getLocation((reservation as any).location_id) : null,
      (reservation as any).menu_item_id ? db.getMenuItem((reservation as any).menu_item_id) : null,
      db.getAppUsers(),
    ]);
    return c.json({
      reservation,
      customer: customer || null,
      location: location || null,
      menu_item: menuItem || null,
      users: users || [],
    });
  } catch (error) {
    console.log(`Get reservation detail error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Create/Update reservation
app.post('/make-server-fe84bde0/reservations', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const {
      reservation_id,
      reservation_date_time,
      duration_minutes,
      location_id,
      customer_id,
      staff_id_main,
      status,
      payment_status,
      payment_method,
      work_required,
      notes_staff,
      menu_item_id,
      additional_units,
      photo_required,
    } = body;

    const reservationId = reservation_id || crypto.randomUUID();

    // Generate reservation_number if not exists (for new reservations)
    let reservationNumber = body.reservation_number;
    if (!reservation_id) {
      // Generate a unique 5-character lowercase alphanumeric reservation number
      const existingNumbers = new Set(await db.getReservationNumbers());
      
      let attempts = 0;
      const maxAttempts = 100;
      
      do {
        // Generate random 5-character lowercase alphanumeric string
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        reservationNumber = Array.from({ length: 5 }, () => 
          chars.charAt(Math.floor(Math.random() * chars.length))
        ).join('');
        attempts++;
        
        if (attempts >= maxAttempts) {
          throw new Error('予約番号の生成に失敗しました');
        }
      } while (existingNumbers.has(reservationNumber));
      
      console.log(`[予約作成] 新しい予約番号を生成: ${reservationNumber}`);
    }

    const reservationData = {
      reservation_id: reservationId,
      reservation_number: reservationNumber,
      reservation_date_time,
      duration_minutes: duration_minutes || 30,
      location_id,
      customer_id,
      staff_id_main,
      status: status || 'tentative',
      payment_status: payment_status || 'unpaid',
      payment_method,
      work_required,
      notes_staff,
      menu_item_id: menu_item_id || null,
      additional_units: additional_units || 0,
      photo_required: photo_required || 'not_set',
      created_at: body.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by_user_id: user.id,
    };

    await db.upsertReservation(reservationData);

    // Auto-create work order if status is confirmed and work_required is set
    if (status === 'confirmed' && work_required && work_required.trim() !== '') {
      // Check if work order already exists for this reservation (条件付き取得で当該予約のみ)
      const existingForReservation = await db.getWorkOrdersByReservationIds([reservationId]);
      if (existingForReservation.length === 0) {
        // Create work order automatically
        const workOrderId = crypto.randomUUID();
        
        // Calculate due date: 14 days from reservation date
        const reservationDate = new Date(reservation_date_time);
        const dueDate = new Date(reservationDate);
        dueDate.setDate(dueDate.getDate() + 14);

        const workOrderData = {
          work_order_id: workOrderId,
          reservation_id: reservationId,
          product_type: work_required,
          status: '乾燥中',
          due_date: dueDate.toISOString().split('T')[0],
          delivered_date: null,
          priority_order: null,
          notes_internal: '予約確定時に自動生成',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by_user_id: user.id,
        };

        await db.upsertWorkOrder(workOrderData);

        console.log(`Auto-created work order ${workOrderId} for reservation ${reservationId}`);
      }
    }

    // Sync to Google Calendar
    try {
      const customer = await db.getCustomer(reservationData.customer_id);
      const menuItem = reservationData.menu_item_id ? await db.getMenuItem(reservationData.menu_item_id) : null;
      const location = await db.getLocation(reservationData.location_id);
      
      const action = reservation_id ? 'update' : 'create';
      
      if (reservationData.status !== 'cancelled') {
        const eventId = await syncToGoogleCalendar(action, reservationData, customer, menuItem, location);
        console.log('[Reservation] Calendar sync result', { eventId, reservationId });
        if (eventId && eventId !== reservationData.google_event_id) {
           reservationData.google_event_id = eventId;
           // Save again with event ID
           await db.upsertReservation(reservationData);
        }
      } else if (action === 'update' && reservationData.status === 'cancelled') {
         // If cancelled, delete from calendar
         await syncToGoogleCalendar('delete', reservationData);
         if (reservationData.google_event_id) {
             delete reservationData.google_event_id;
             await db.upsertReservation(reservationData);
         }
      }
    } catch (calError) {
      console.error('[Reservation] Calendar sync failed:', calError);
    }

    // Audit log
    await db.insertAuditLog({
      ref_table: 'reservations',
      ref_id: reservationId,
      action_type: reservation_id ? 'update' : 'create',
      after_json: reservationData,
      acted_by_user_id: user.id,
      acted_at: new Date().toISOString(),
    });

    return c.json({ success: true, reservation: reservationData });
  } catch (error) {
    console.log(`Create/Update reservation error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Delete reservation
app.delete('/make-server-fe84bde0/reservations/:id', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const reservationId = c.req.param('id');
    const reservation = await db.getReservation(reservationId);

    // Sync to Google Calendar
    try {
       if (reservation) {
         await syncToGoogleCalendar('delete', reservation);
       }
    } catch (e) { console.error(e); }

    await db.deleteReservation(reservationId);

    // Audit log
    await db.insertAuditLog({
      ref_table: 'reservations',
      ref_id: reservationId,
      action_type: 'delete',
      before_json: reservation,
      acted_by_user_id: user.id,
      acted_at: new Date().toISOString(),
    });

    return c.json({ success: true });
  } catch (error) {
    console.log(`Delete reservation error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Batch create work orders for existing confirmed reservations (admin only)
app.post('/make-server-fe84bde0/reservations/batch-create-work-orders', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // 管理者・スタッフともにカレンダーからの一括自動作成を許可
    const reservations = await db.getReservations();
    const workOrders = await db.getWorkOrders();
    const menuItems = await db.getMenuItems();

    const menuById = new Map<string, { name?: string }>();
    for (const m of menuItems as { menu_item_id: string; name?: string }[]) {
      menuById.set(m.menu_item_id, m);
    }

    let createdCount = 0;
    const createdWorkOrders = [];

    const getJapanNow = () => {
      const now = new Date();
      const jstOffset = 9 * 60;
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      return new Date(utc + (jstOffset * 60000));
    };
    const japanNow = getJapanNow();

    for (const reservation of reservations) {
      if (reservation.status !== 'confirmed') continue;
      const reservationDate = new Date(reservation.reservation_date_time as string);
      if (reservationDate >= japanNow) continue;

      const existingWorkOrder = workOrders.find((wo: any) => wo.reservation_id === reservation.reservation_id);
      if (existingWorkOrder) continue;

      const workRequired = (reservation.work_required as string)?.trim();
      const productType = workRequired
        ? workRequired
        : (menuById.get(reservation.menu_item_id as string)?.name) || 'メニュー不明';

      const workOrderId = crypto.randomUUID();
      const dueDate = new Date(reservationDate);
      dueDate.setDate(dueDate.getDate() + 28);

      const workOrderData = {
        work_order_id: workOrderId,
        reservation_id: reservation.reservation_id,
        product_type: productType,
        status: '制作中',
        due_date: dueDate.toISOString().split('T')[0],
        delivered_date: null,
        priority_order: null,
        notes_internal: '予約確定により自動作成',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by_user_id: user.id,
      };

      await db.upsertWorkOrder(workOrderData);
      createdCount++;
      createdWorkOrders.push(workOrderData);
    }

    return c.json({ 
      success: true, 
      created_count: createdCount,
      work_orders: createdWorkOrders,
      message: `${createdCount}件の制作物を生成しました`
    });
  } catch (error) {
    console.log(`Batch create work orders error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Work Orders ==========

// Get work orders（optional: ?month=YYYY-MM で範囲指定、待機時間削減）
app.get('/make-server-fe84bde0/work-orders', async (c) => {
  const t0 = Date.now();
  try {
    const user = await getAuthUser(c.req.raw);
    const tAuth = Date.now();
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const reservationIds = c.req.query('reservation_ids');
    if (reservationIds) {
      const ids = reservationIds.split(',').filter(Boolean);
      const workOrders = await db.getWorkOrdersByReservationIdsAll(ids);
      return c.json({ work_orders: workOrders });
    }

    let workOrders = await db.getWorkOrders();
    const month = c.req.query('month');
    if (month) {
      const [y, m] = month.split('-').map(Number);
      const startDate = new Date(y, m - 1, 1);
      const endDate = new Date(y, m, 0, 23, 59, 59, 999);
      workOrders = workOrders.filter((wo: any) => {
        const d = new Date(wo.due_date || wo.created_at || 0);
        return d >= startDate && d <= endDate;
      });
    }
    const tEnd = Date.now();
    console.log(`[Perf] GET /work-orders authMs=${tAuth - t0} dbMs=${tEnd - tAuth} totalMs=${tEnd - t0} count=${workOrders.length}`);
    return c.json({ work_orders: workOrders });
  } catch (error) {
    console.log(`Get work orders error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Create/Update work order
app.post('/make-server-fe84bde0/work-orders', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const {
      work_order_id,
      customer_id,
      reservation_id,
      product_type,
      status,
      due_date,
      delivered_date,
      pickup_date,
      priority_order,
      notes_internal,
      photo_data_status,
      nameplate_name,
      coloring_type,
      frame_color,
      mount_color,
      status_comments,
    } = body;

    const workOrderId = work_order_id || crypto.randomUUID();

    // Check for duplicate work orders for the same reservation and product type (only for new work orders)
    if (!work_order_id && reservation_id) {
      const workOrdersForReservation = await db.getWorkOrdersByReservationIdsAll([reservation_id]);
      const duplicateExists = workOrdersForReservation.some((wo: any) =>
        wo.product_type === product_type && wo.work_order_id !== workOrderId
      );
      
      if (duplicateExists) {
        console.log(`Duplicate work order prevented: reservation_id=${reservation_id}, product_type=${product_type}`);
        return c.json({ 
          error: '同じ予約・同じ商品タイプの制作物が既に存在します',
          duplicate: true 
        }, 400);
      }
    }

    const workOrderData = {
      work_order_id: workOrderId,
      customer_id: customer_id || null,
      reservation_id,
      product_type,
      status: status || '乾燥中',
      due_date,
      delivered_date,
      pickup_date,
      priority_order: priority_order ?? null,
      notes_internal,
      photo_data_status: photo_data_status || 'not_set',
      nameplate_name: nameplate_name || null,
      coloring_type: coloring_type || null,
      frame_color: frame_color || null,
      mount_color: mount_color || null,
      status_comments: status_comments || {},
      created_at: body.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by_user_id: user.id,
    };

    await db.upsertWorkOrder(workOrderData);

    // Audit log
    await db.insertAuditLog({
      ref_table: 'work_orders',
      ref_id: workOrderId,
      action_type: work_order_id ? 'update' : 'create',
      after_json: workOrderData,
      acted_by_user_id: user.id,
      acted_at: new Date().toISOString(),
    });

    return c.json({ success: true, work_order: workOrderData });
  } catch (error) {
    console.log(`Create/Update work order error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Delete work order
app.delete('/make-server-fe84bde0/work-orders/:id', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const workOrderId = c.req.param('id');
    const workOrder = await db.getWorkOrder(workOrderId);

    if (!workOrder) {
      return c.json({ error: 'Work order not found' }, 404);
    }

    await db.deleteWorkOrder(workOrderId);

    // Audit log
    await db.insertAuditLog({
      ref_table: 'work_orders',
      ref_id: workOrderId,
      action_type: 'delete',
      before_json: workOrder,
      acted_by_user_id: user.id,
      acted_at: new Date().toISOString(),
    });

    return c.json({ success: true });
  } catch (error) {
    console.log(`Delete work order error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Update work order priority
app.post('/make-server-fe84bde0/work-orders/reorder', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { orders } = body; // Array of { work_order_id, priority_order }

    for (const item of orders) {
      const workOrder = await db.getWorkOrder(item.work_order_id);
      if (workOrder) {
        workOrder.priority_order = item.priority_order;
        workOrder.updated_at = new Date().toISOString();
        workOrder.updated_by_user_id = user.id;
        await db.upsertWorkOrder(workOrder);
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.log(`Reorder work orders error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Incentives ==========

// Debug API: Check reservation and work order status
app.get('/make-server-fe84bde0/incentives/debug', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const targetDate = c.req.query('date'); // Format: 2024-10-29
    const targetStaffId = c.req.query('staff_id');

    const reservations = await db.getReservations();
    const workOrders = await db.getWorkOrders();
    const users = await db.getAppUsers();

    // Filter reservations by date and staff
    const filteredReservations = reservations.filter((r: any) => {
      const resDate = r.reservation_date_time?.split('T')[0];
      const matchDate = !targetDate || resDate === targetDate;
      const matchStaff = !targetStaffId || r.staff_id_main === targetStaffId;
      return matchDate && matchStaff;
    });

    const debugInfo = filteredReservations.map((res: any) => {
      const staff = users.find((u: any) => u.user_id === res.staff_id_main);
      const relatedWorkOrders = workOrders.filter((wo: any) => wo.reservation_id === res.reservation_id);

      const incentiveEligible = res.status === 'confirmed' && res.work_required && res.status !== 'cancelled';

      return {
        reservation_id: res.reservation_id,
        reservation_date: res.reservation_date_time?.split('T')[0],
        reservation_year_month: res.reservation_date_time?.slice(0, 7),
        staff_name: staff?.name || '不明',
        staff_id: res.staff_id_main,
        status: res.status,
        work_required: res.work_required,
        incentive_eligible: incentiveEligible,
        incentive_reason: incentiveEligible 
          ? 'Confirmed reservation with work required' 
          : res.status === 'cancelled' 
          ? 'Cancelled reservation - no incentive' 
          : res.status === 'rescheduled'
          ? 'Rescheduled reservation - no incentive'
          : res.status === 'tentative' 
          ? 'Tentative reservation - pending confirmation'
          : !res.work_required
          ? 'No work required - no incentive'
          : 'Unknown reason',
        work_orders_count: relatedWorkOrders.length,
        work_orders: relatedWorkOrders.map((wo: any) => ({
          work_order_id: wo.work_order_id,
          product_type: wo.product_type,
          status: wo.status,
          delivered_date: wo.delivered_date,
        })),
      };
    });

    return c.json({
      date: targetDate,
      staff_id: targetStaffId,
      reservations_found: debugInfo.length,
      details: debugInfo,
      summary: {
        total_reservations: debugInfo.length,
        confirmed_with_work: debugInfo.filter((d: any) => d.status === 'confirmed' && d.work_required).length,
        tentative_with_work: debugInfo.filter((d: any) => d.status === 'tentative' && d.work_required).length,
        cancelled: debugInfo.filter((d: any) => d.status === 'cancelled').length,
        incentive_eligible: debugInfo.filter((d: any) => d.incentive_eligible).length,
        reservations_with_work_orders: debugInfo.filter((d: any) => d.work_orders_count > 0).length,
        reservations_without_work_orders: debugInfo.filter((d: any) => d.work_orders_count === 0).length,
      }
    });
  } catch (error) {
    console.log(`Debug incentives error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Calculate incentives
app.get('/make-server-fe84bde0/incentives', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    const yearMonth = c.req.query('year_month') || new Date().toISOString().slice(0, 7);
    const targetUserId = c.req.query('user_id');

    // If staff, can only see their own incentives
    if (role !== 'admin' && targetUserId && targetUserId !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get all reservations
    const reservations = await db.getReservations();

    // Build incentive data for each staff based on confirmed reservations
    const incentivesMap = new Map();

    for (const reservation of reservations) {
      if (!reservation.staff_id_main) continue;

      // Skip cancelled and rescheduled reservations - no incentive for these
      if (reservation.status === 'cancelled' || reservation.status === 'rescheduled') continue;

      // Skip reservations without work required
      if (!reservation.work_required) continue;

      const staffId = reservation.staff_id_main;
      const reservationDate = reservation.reservation_date_time ? new Date(reservation.reservation_date_time) : null;
      const reservationYearMonth = reservationDate ? reservationDate.toISOString().slice(0, 7) : null;

      if (!incentivesMap.has(staffId)) {
        incentivesMap.set(staffId, {
          user_id: staffId,
          tentative: [],
          confirmed: [],
        });
      }

      const staffData = incentivesMap.get(staffId);

      // Tentative reservations show as "pending" incentive
      if (reservation.status === 'tentative' && reservationYearMonth === yearMonth) {
        staffData.tentative.push(reservation);
      } 
      // Confirmed reservations count as earned incentive for the reservation month
      else if (reservation.status === 'confirmed' && reservationYearMonth === yearMonth) {
        staffData.confirmed.push(reservation);
      }
    }

    // Get manual adjustments
    const adjustments = await db.getAllIncentiveMonthly();

    const results = [];
    for (const [staffId, data] of incentivesMap) {
      // Skip if not the target user (for staff role)
      if (role !== 'admin' && staffId !== user.id) continue;
      if (targetUserId && staffId !== targetUserId) continue;

      const adjustment = adjustments.find((a: any) => a.user_id === staffId && a.year_month === yearMonth);

      results.push({
        user_id: staffId,
        year_month: yearMonth,
        count_pending: data.tentative.length,
        amount_pending: data.tentative.length * 1000,
        count_confirmed: data.confirmed.length,
        amount_confirmed: data.confirmed.length * 1000,
        manual_adjust_yen: adjustment?.manual_adjust_yen || 0,
        locked_flag: adjustment?.locked_flag || false,
        locked_at: adjustment?.locked_at || null,
      });
    }

    return c.json({ incentives: results });
  } catch (error) {
    console.log(`Get incentives error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Lock/unlock incentive month (admin only)
app.post('/make-server-fe84bde0/incentives/lock', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const body = await c.req.json();
    const { user_id, year_month, locked_flag, manual_adjust_yen } = body;

    const existing = await db.getIncentiveMonthly(user_id, year_month) || {};

    const incentiveData = {
      ...existing,
      user_id,
      year_month,
      locked_flag,
      manual_adjust_yen: manual_adjust_yen ?? (existing as any).manual_adjust_yen ?? 0,
      locked_at: locked_flag ? new Date().toISOString() : (existing as any).locked_at,
      adjusted_by_user_id: user.id,
      updated_at: new Date().toISOString(),
    };

    await db.upsertIncentiveMonthly(incentiveData);

    // Audit log
    await db.insertAuditLog({
      ref_table: 'incentives_monthly',
      ref_id: `${user_id}:${year_month}`,
      action_type: 'update',
      after_json: incentiveData,
      acted_by_user_id: user.id,
      acted_at: new Date().toISOString(),
    });

    return c.json({ success: true, incentive: incentiveData });
  } catch (error) {
    console.log(`Lock incentive error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get yearly incentives
app.get('/make-server-fe84bde0/incentives/yearly', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    const year = c.req.query('year') || new Date().getFullYear().toString();
    const targetUserId = c.req.query('user_id');

    // If staff, can only see their own incentives
    if (role !== 'admin' && targetUserId && targetUserId !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get all reservations and users
    const reservations = await db.getReservations();
    const users = await db.getAppUsers();
    const adjustments = await db.getAllIncentiveMonthly();

    const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

    // Initialize monthly data
    const monthlyDataMap = new Map<string, { totalAmount: number; confirmedCount: number }>();
    const staffYearlyDataMap = new Map<string, { totalAmount: number; confirmedCount: number; staffName: string }>();
    
    for (let i = 0; i < 12; i++) {
      monthlyDataMap.set(MONTH_NAMES[i], { totalAmount: 0, confirmedCount: 0 });
    }

    let totalIncentives = 0;
    let totalConfirmedCount = 0;
    let totalPendingCount = 0;

    // Process reservations
    for (const reservation of reservations) {
      if (!reservation.staff_id_main) continue;

      // Skip cancelled and rescheduled reservations - no incentive for these
      if (reservation.status === 'cancelled' || reservation.status === 'rescheduled') continue;

      // Skip reservations without work required
      if (!reservation.work_required) continue;

      const staffId = reservation.staff_id_main;

      // Filter by user if specified
      if (targetUserId && staffId !== targetUserId) continue;
      if (role !== 'admin' && staffId !== user.id) continue;

      const reservationDate = reservation.reservation_date_time ? new Date(reservation.reservation_date_time) : null;
      const resYear = reservationDate ? reservationDate.getFullYear().toString() : null;
      const resMonth = reservationDate ? reservationDate.getMonth() : null;
      const resYearMonth = reservationDate ? reservationDate.toISOString().slice(0, 7) : null;

      // Pending count (tentative)
      if (reservation.status === 'tentative') {
        totalPendingCount += 1;
      }

      // Confirmed count and amount
      if (reservation.status === 'confirmed' && resYear === year) {
        const baseAmount = 1000; // ¥1,000 per reservation

        // Get manual adjustment for this month
        const adjustment = adjustments.find((a: any) => 
          a.user_id === staffId && a.year_month === resYearMonth
        );
        const manualAdjust = adjustment?.manual_adjust_yen || 0;

        // Get staff name
        const staffUser = users.find((u: any) => u.user_id === staffId);
        const staffName = staffUser?.name || staffId;

        // Update monthly data
        if (resMonth !== null) {
          const monthName = MONTH_NAMES[resMonth];
          const monthData = monthlyDataMap.get(monthName);
          if (monthData) {
            monthData.totalAmount += baseAmount;
            monthData.confirmedCount += 1;
          }
        }

        // Update staff yearly data
        if (!staffYearlyDataMap.has(staffId)) {
          staffYearlyDataMap.set(staffId, { totalAmount: 0, confirmedCount: 0, staffName });
        }
        const staffData = staffYearlyDataMap.get(staffId)!;
        staffData.totalAmount += baseAmount;
        staffData.confirmedCount += 1;

        totalIncentives += baseAmount;
        totalConfirmedCount += 1;
      }
    }

    // Add manual adjustments to staff yearly data
    for (const adjustment of adjustments) {
      if (!adjustment.year_month.startsWith(year)) continue;
      
      const staffId = adjustment.user_id;
      if (targetUserId && staffId !== targetUserId) continue;
      if (role !== 'admin' && staffId !== user.id) continue;

      if (staffYearlyDataMap.has(staffId)) {
        staffYearlyDataMap.get(staffId)!.totalAmount += (adjustment.manual_adjust_yen || 0);
      }
      
      totalIncentives += (adjustment.manual_adjust_yen || 0);

      // Add to monthly data
      const monthIndex = parseInt(adjustment.year_month.split('-')[1]) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        const monthName = MONTH_NAMES[monthIndex];
        const monthData = monthlyDataMap.get(monthName);
        if (monthData) {
          monthData.totalAmount += (adjustment.manual_adjust_yen || 0);
        }
      }
    }

    const monthlyData = Array.from(monthlyDataMap.entries()).map(([month, data]) => ({
      month,
      totalAmount: data.totalAmount,
      confirmedCount: data.confirmedCount,
    }));

    const staffYearlyData = Array.from(staffYearlyDataMap.entries())
      .map(([id, data]) => ({
        name: data.staffName,
        totalAmount: data.totalAmount,
        confirmedCount: data.confirmedCount,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const averageIncentive = totalIncentives / 12;

    return c.json({
      totalIncentives,
      totalConfirmedCount,
      totalPendingCount,
      averageIncentive,
      monthlyData,
      staffYearlyData,
    });
  } catch (error) {
    console.log(`Get yearly incentives error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get incentives for a custom range
app.get('/make-server-fe84bde0/incentives/range', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    const startMonth = c.req.query('start') || new Date().toISOString().slice(0, 7);
    const endMonth = c.req.query('end') || new Date().toISOString().slice(0, 7);
    const targetUserId = c.req.query('user_id');

    // If staff, can only see their own incentives
    if (role !== 'admin' && targetUserId && targetUserId !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Get all reservations
    const reservations = await db.getReservations();
    const adjustments = await db.getAllIncentiveMonthly();

    // Build incentive data for each staff across the range
    const incentivesMap = new Map();

    for (const reservation of reservations) {
      if (!reservation.staff_id_main) continue;

      // Skip cancelled and rescheduled reservations - no incentive for these
      if (reservation.status === 'cancelled' || reservation.status === 'rescheduled') continue;

      // Skip reservations without work required
      if (!reservation.work_required) continue;

      const staffId = reservation.staff_id_main;
      const reservationDate = reservation.reservation_date_time ? new Date(reservation.reservation_date_time) : null;
      const resYearMonth = reservationDate ? reservationDate.toISOString().slice(0, 7) : null;

      if (!incentivesMap.has(staffId)) {
        incentivesMap.set(staffId, {
          user_id: staffId,
          tentative: [],
          confirmed: [],
        });
      }

      const staffData = incentivesMap.get(staffId);

      if (reservation.status === 'tentative' && resYearMonth && resYearMonth >= startMonth && resYearMonth <= endMonth) {
        staffData.tentative.push(reservation);
      } else if (reservation.status === 'confirmed' && resYearMonth && resYearMonth >= startMonth && resYearMonth <= endMonth) {
        staffData.confirmed.push(reservation);
      }
    }

    const results = [];
    for (const [staffId, data] of incentivesMap) {
      // Skip if not the target user (for staff role)
      if (role !== 'admin' && staffId !== user.id) continue;
      if (targetUserId && staffId !== targetUserId) continue;

      // Sum up manual adjustments in range
      let totalManualAdjust = 0;
      for (const adj of adjustments) {
        if (adj.user_id === staffId && adj.year_month >= startMonth && adj.year_month <= endMonth) {
          totalManualAdjust += (adj.manual_adjust_yen || 0);
        }
      }

      results.push({
        user_id: staffId,
        count_pending: data.tentative.length,
        amount_pending: data.tentative.length * 1000,
        count_confirmed: data.confirmed.length,
        amount_confirmed: data.confirmed.length * 1000,
        manual_adjust_yen: totalManualAdjust,
        locked_flag: false, // Range view doesn't have lock status
        locked_at: null,
      });
    }

    return c.json({ incentives: results });
  } catch (error) {
    console.log(`Get range incentives error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Users/Staff Management ==========

// Get all users (admin only)
app.get('/make-server-fe84bde0/users', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const users = await db.getAppUsers();
    return c.json({ users: users.map((u: Record<string, unknown>) => sanitizeUserForResponse(u)) });
  } catch (error) {
    console.log(`Get users error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Update user (admin only)
app.post('/make-server-fe84bde0/users/update', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const body = await c.req.json();
    const { user_id, name, role: newRole, active_flag, update_login_id, update_password } = body;

    const userData = await db.getAppUser(user_id);
    if (!userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    userData.name = name ?? userData.name;
    userData.role = newRole ?? userData.role;
    userData.active_flag = active_flag ?? userData.active_flag;
    
    // Update login_id if provided
    if (update_login_id) {
      // Check if login_id is already taken by another user
      const users = await db.getAppUsers();
      const existingUser = users.find((u: any) => u.login_id === update_login_id && u.user_id !== user_id);
      if (existingUser) {
        return c.json({ error: 'このログインIDは既に使用されています' }, 400);
      }
      userData.login_id = update_login_id;
    }
    
    // Update password in Supabase Auth and KV password_hash if provided
    if (update_password) {
      if (update_password.length < 6) {
        return c.json({ error: 'パスワードは6文字以上で設定してください' }, 400);
      }
      const { error: passwordError } = await supabase.auth.admin.updateUserById(
        user_id,
        { password: update_password }
      );
      if (passwordError) {
        console.error(`Failed to update password: ${passwordError.message}`);
        return c.json({ error: `パスワード更新に失敗しました: ${passwordError.message}` }, 500);
      }
      userData.password_hash = await bcrypt.hash(update_password, SALT_ROUNDS);
      userData.must_change_password = false;
    }

    userData.updated_at = new Date().toISOString();
    await db.upsertAppUser(userData);

    return c.json({ success: true, user: sanitizeUserForResponse(userData) });
  } catch (error) {
    console.log(`Update user error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Menu Items ==========

// Get all menu items
app.get('/make-server-fe84bde0/menu-items', async (c) => {
  const t0 = Date.now();
  try {
    const user = await getAuthUser(c.req.raw);
    const tAuth = Date.now();
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const menuItems = await db.getMenuItems();
    const tEnd = Date.now();
    console.log(`[Perf] GET /menu-items authMs=${tAuth - t0} dbMs=${tEnd - tAuth} totalMs=${tEnd - t0} count=${menuItems.length}`);
    return c.json({ menu_items: menuItems });
  } catch (error) {
    console.log(`Get menu items error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Create/Update menu item
app.post('/make-server-fe84bde0/menu-items', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const body = await c.req.json();
    const {
      menu_item_id,
      name,
      base_price,
      additional_unit_price,
      description,
      duration_minutes,
      is_active,
      discount_type,
      discount_value,
      discount_end_date,
      apply_discount_to_additional,
    } = body;

    const menuItemId = menu_item_id || crypto.randomUUID();

    const menuItemData = {
      menu_item_id: menuItemId,
      name,
      base_price,
      additional_unit_price,
      description: description || '',
      duration_minutes: duration_minutes || 60,
      is_active: is_active ?? true,
      discount_type: discount_type || 'none',
      discount_value: discount_value !== null && discount_value !== undefined ? discount_value : null,
      discount_end_date: discount_end_date || null,
      apply_discount_to_additional: apply_discount_to_additional ?? false,
      created_at: body.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.upsertMenuItem(menuItemData);
    cacheInvalidate('menu_items');

    // 新規作成時のみ、全店舗にデフォルトで追加
    if (!menu_item_id) {
      const locations = await db.getLocations();
      for (const location of locations) {
        await db.upsertLocationMenu({
          location_id: location.location_id,
          menu_item_id: menuItemId,
          enabled: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      console.log(`Auto-added menu ${menuItemId} to ${locations.length} locations`);
    }

    // Audit log
    await db.insertAuditLog({
      ref_table: 'menu_items',
      ref_id: menuItemId,
      action_type: menu_item_id ? 'update' : 'create',
      after_json: menuItemData,
      acted_by_user_id: user.id,
      acted_at: new Date().toISOString(),
    });

    return c.json({ success: true, menu_item: menuItemData });
  } catch (error) {
    console.log(`Create/Update menu item error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Delete menu item
app.delete('/make-server-fe84bde0/menu-items/:id', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const menuItemId = c.req.param('id');
    const menuItem = await db.getMenuItem(menuItemId);

    await db.deleteMenuItem(menuItemId);
    cacheInvalidate('menu_items');

    // Audit log
    await db.insertAuditLog({
      ref_table: 'menu_items',
      ref_id: menuItemId,
      action_type: 'delete',
      before_json: menuItem,
      acted_by_user_id: user.id,
      acted_at: new Date().toISOString(),
    });

    return c.json({ success: true });
  } catch (error) {
    console.log(`Delete menu item error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Batch fix menu duration
app.post('/make-server-fe84bde0/menu-items/batch-fix-duration', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const menuItems = await db.getMenuItems();
    const reservations = await db.getReservations();
    let menuUpdatedCount = 0;
    let reservationUpdatedCount = 0;

    // Update menu items
    for (const item of menuItems) {
      if (!item.duration_minutes) {
        item.duration_minutes = 60; // デフォルトの所要時間
        await db.upsertMenuItem(item);
        menuUpdatedCount++;
      }
    }

    // Update reservations with duration from menu
    for (const reservation of reservations) {
      if (reservation.menu_item_id && (!reservation.duration_minutes || reservation.duration_minutes === 30)) {
        const menu = menuItems.find((m: any) => m.menu_item_id === reservation.menu_item_id);
        if (menu && menu.duration_minutes) {
          reservation.duration_minutes = menu.duration_minutes;
          await db.upsertReservation(reservation);
          reservationUpdatedCount++;
        }
      }
    }

    console.log(`Batch fix duration: ${menuUpdatedCount} menus, ${reservationUpdatedCount} reservations updated`);
    return c.json({ 
      success: true, 
      menu_updated_count: menuUpdatedCount,
      reservation_updated_count: reservationUpdatedCount
    });
  } catch (error) {
    console.log(`Batch fix duration error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get menu items by location
app.get('/make-server-fe84bde0/locations/:location_id/menus', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const locationId = c.req.param('location_id');
    const allMenus = await db.getMenuItems();
    const locationMenus = await db.getLocationMenus(locationId);

    // メニューと店舗設定を��ージ
    const menusWithStatus = allMenus.map((menu: any) => {
      const locationMenu = locationMenus.find((lm: any) => lm.menu_item_id === menu.menu_item_id);
      return {
        ...menu,
        enabled_at_location: locationMenu ? locationMenu.enabled : false,
      };
    });

    return c.json({ menu_items: menusWithStatus });
  } catch (error) {
    console.log(`Get location menus error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Toggle menu for location
app.post('/make-server-fe84bde0/locations/:location_id/menus/:menu_id/toggle', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const locationId = c.req.param('location_id');
    const menuId = c.req.param('menu_id');
    const body = await c.req.json();
    const { enabled } = body;

    const existing = await db.getLocationMenu(locationId, menuId);

    const locationMenuData = {
      location_id: locationId,
      menu_item_id: menuId,
      enabled: enabled ?? true,
      created_at: (existing as any)?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.upsertLocationMenu(locationMenuData);

    return c.json({ success: true, location_menu: locationMenuData });
  } catch (error) {
    console.log(`Toggle location menu error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get location settings for one menu item (all locations in one call — avoids N+1)
app.get('/make-server-fe84bde0/menu-items/:menu_item_id/location-settings', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const menuItemId = c.req.param('menu_item_id');
    const allLocationMenus = await db.getLocationMenusByMenuItemId(menuItemId);
    const settings: Record<string, boolean> = {};
    for (const lm of allLocationMenus) {
      settings[(lm as any).location_id] = (lm as any).enabled ?? false;
    }
    return c.json({ location_settings: settings });
  } catch (error) {
    console.log(`Get menu item location settings error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Staff (alias for users, for compatibility) ==========

// Get all staff
app.get('/make-server-fe84bde0/staff', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const users = await db.getAppUsers();
    // Filter active users only
    const activeUsers = users.filter((u: any) => u.active_flag !== false);
    return c.json({ staff: activeUsers });
  } catch (error) {
    console.log(`Get staff error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Sales Analytics ==========

// Get sales analytics data
app.get('/make-server-fe84bde0/sales-analytics', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const startDate = c.req.query('startDate') || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const endDate = c.req.query('endDate') || new Date().toISOString().split('T')[0];
    const viewMode = c.req.query('viewMode') || 'month';

    // Get all data
    const reservations = await db.getReservations();
    const menuItems = await db.getMenuItems();
    const locations = await db.getLocations();
    const users = await db.getAppUsers();
    const customers = await db.getCustomers({ activeOnly: false });

    // Filter reservations by date range
    const filteredReservations = reservations.filter((r: any) => {
      const resDate = r.reservation_date_time.split('T')[0];
      return resDate >= startDate && resDate <= endDate;
    });

    // Calculate total revenue and counts
    let totalRevenue = 0;
    let confirmedRevenue = 0;
    let pendingRevenue = 0;
    let cancelledCount = 0;
    let rescheduledCount = 0;
    let totalAdditionalUnits = 0;
    let reservationsWithAdditionalUnits = 0;
    const dailySalesMap = new Map<string, { revenue: number; count: number }>();
    const monthlySalesMap = new Map<string, { revenue: number; count: number }>();
    const ageGroupSalesMap = new Map<string, { revenue: number; count: number; ageGroup: string; additionalCount: number; totalAdditionalUnits: number }>();
    const zeroAgeMonthsMap = new Map<string, { revenue: number; count: number; months: number }>();

    for (const reservation of filteredReservations) {
      const menuItem = menuItems.find((m: any) => m.menu_item_id === reservation.menu_item_id);
      const price = menuItem ? (menuItem.base_price + (reservation.additional_units || 0) * menuItem.additional_unit_price) : 0;

      // Total revenue (all statuses except cancelled and rescheduled)
      if (reservation.status !== 'cancelled' && reservation.status !== 'rescheduled') {
        totalRevenue += price;

        // Confirmed revenue
        if (reservation.status === 'confirmed') {
          confirmedRevenue += price;
        }

        // Pending revenue
        if (reservation.status === 'tentative') {
          pendingRevenue += price;
        }

        // Additional units statistics
        if (reservation.additional_units && reservation.additional_units > 0) {
          totalAdditionalUnits += reservation.additional_units;
          reservationsWithAdditionalUnits += 1;
        }

        // Daily sales
        const date = reservation.reservation_date_time.split('T')[0];
        const dailyData = dailySalesMap.get(date) || { revenue: 0, count: 0 };
        dailyData.revenue += price;
        dailyData.count += 1;
        dailySalesMap.set(date, dailyData);

        // Monthly sales (for year view)
        const month = date.substring(0, 7); // YYYY-MM
        const monthlyData = monthlySalesMap.get(month) || { revenue: 0, count: 0 };
        monthlyData.revenue += price;
        monthlyData.count += 1;
        monthlySalesMap.set(month, monthlyData);

        // Age group sales
        const customer = customers.find((c: any) => c.customer_id === reservation.customer_id);
        if (customer) {
          // 月齢が入力されている場合は、歳がnullでも0歳として扱う
          const hasMonths = customer.child_age_months !== null && customer.child_age_months !== undefined;
          const age = customer.child_age_years ?? (hasMonths ? 0 : null);
          
          if (age !== null && age !== undefined) {
            let ageGroup = '';
            
            if (age === 0) {
              ageGroup = '0歳';
              // 0歳の場合、月齢別データも記録
              const months = customer.child_age_months !== undefined && customer.child_age_months !== null ? customer.child_age_months : 0;
              const monthKey = `${months}ヶ月`;
              const monthData = zeroAgeMonthsMap.get(monthKey) || { revenue: 0, count: 0, months };
              monthData.revenue += price;
              monthData.count += 1;
              zeroAgeMonthsMap.set(monthKey, monthData);
            } else if (age === 1) {
              ageGroup = '1歳';
            } else if (age === 2) {
              ageGroup = '2歳';
            } else if (age === 3) {
              ageGroup = '3歳';
            } else if (age === 4) {
              ageGroup = '4歳';
            } else if (age >= 5) {
              ageGroup = '5歳以上';
            }
            
            if (ageGroup) {
              const ageData = ageGroupSalesMap.get(ageGroup) || { 
                revenue: 0, 
                count: 0, 
                ageGroup,
                additionalCount: 0,
                totalAdditionalUnits: 0
              };
              ageData.revenue += price;
              ageData.count += 1;
              
              // 追加本数の統計
              if (reservation.additional_units && reservation.additional_units > 0) {
                ageData.additionalCount += 1;
                ageData.totalAdditionalUnits += reservation.additional_units;
              }
              
              ageGroupSalesMap.set(ageGroup, ageData);
            }
          }
        }
      } else {
        // Count cancelled and rescheduled separately
        if (reservation.status === 'cancelled') {
          cancelledCount += 1;
        } else if (reservation.status === 'rescheduled') {
          rescheduledCount += 1;
        }
      }
    }

    // Convert maps to arrays
    const dailySales = Array.from(dailySalesMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Monthly sales for year view
    const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    let monthlySales = [];
    
    if (viewMode === 'year') {
      // Extract year from startDate
      const year = startDate.substring(0, 4);
      
      // Generate all 12 months
      for (let i = 0; i < 12; i++) {
        const monthKey = `${year}-${String(i + 1).padStart(2, '0')}`;
        const monthData = monthlySalesMap.get(monthKey) || { revenue: 0, count: 0 };
        monthlySales.push({
          month: MONTH_NAMES[i],
          revenue: monthData.revenue,
          count: monthData.count,
        });
      }
    }

    // Calculate average order value (confirmed only)
    const confirmedCount = filteredReservations.filter((r: any) => r.status === 'confirmed').length;
    const averageOrderValue = confirmedCount > 0 ? confirmedRevenue / confirmedCount : 0;

    // Calculate week sales (last 7 days) for month view
    let weekSales = [];
    if (viewMode === 'month') {
      const getJapanDateString = (date: Date) => {
        return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
          .toISOString()
          .slice(0, 10);
      };
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = getJapanDateString(date);
        
        const dayReservations = reservations.filter((r: any) => {
          const resDate = r.reservation_date_time.split('T')[0];
          return resDate === dateStr && r.status !== 'cancelled' && r.status !== 'rescheduled';
        });
        
        let revenue = 0;
        for (const res of dayReservations) {
          const menuItem = menuItems.find((m: any) => m.menu_item_id === res.menu_item_id);
          if (menuItem) {
            revenue += menuItem.base_price + (res.additional_units || 0) * menuItem.additional_unit_price;
          }
        }
        
        weekSales.push({
          date: dateStr,
          revenue,
          count: dayReservations.length,
        });
      }
    }

    // Convert age group map to sorted array
    const ageOrder = ['0歳', '1歳', '2歳', '3歳', '4歳', '5歳以上'];
    const ageGroupSales = Array.from(ageGroupSalesMap.values())
      .sort((a, b) => ageOrder.indexOf(a.ageGroup) - ageOrder.indexOf(b.ageGroup));

    // Convert 0歳 months map to sorted array
    const zeroAgeMonthsData = Array.from(zeroAgeMonthsMap.values())
      .sort((a, b) => a.months - b.months)
      .map(data => ({
        months: data.months,
        label: `${data.months}ヶ月`,
        revenue: data.revenue,
        count: data.count,
      }));

    return c.json({
      totalRevenue,
      totalReservations: filteredReservations.length,
      averageOrderValue,
      confirmedRevenue,
      pendingRevenue,
      cancelledCount,
      rescheduledCount,
      dailySales,
      monthlySales: viewMode === 'year' ? monthlySales : undefined,
      weekSales: viewMode === 'month' ? weekSales : undefined,
      additionalUnitsStats: {
        totalUnits: totalAdditionalUnits,
        reservationsCount: reservationsWithAdditionalUnits,
        averagePerReservation: reservationsWithAdditionalUnits > 0 ? totalAdditionalUnits / reservationsWithAdditionalUnits : 0,
      },
      ageGroupSales,
      zeroAgeMonthsData,
    });
  } catch (error) {
    console.log(`Get sales analytics error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Reservation Settings (予約設定) ==========

// Get reservation settings
app.get('/make-server-fe84bde0/reservation-settings', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user?.id) {
      console.log(`Get reservation settings - Auth error: ${authError?.message}`);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get settings
    let settings = await db.getReservationSettings();
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = {
        reservation_settings_id: 'default',
        allowed_days: [1, 2, 3, 4, 5, 6], // 月～土（日曜除く）
        business_hours_start: '09:00',
        business_hours_end: '18:00',
        advance_reservation_days: 3, // 3日前まで予約不可
        max_reservation_days: 90,
        max_reservations_per_day: 10, // 1日の最大予約数
        concurrent_reservations: 1, // 同時予約可能数
        closed_dates: [], // 休業日
        custom_hours: {}, // 曜日ごとの営業時間
        updated_at: new Date().toISOString(),
      };
      await db.upsertReservationSettings(settings);
    }
    
    return c.json({ settings });
  } catch (error) {
    console.log(`Get reservation settings error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Update reservation settings
app.put('/make-server-fe84bde0/reservation-settings', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user?.id) {
      console.log(`Update reservation settings - Auth error: ${authError?.message}`);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const {
      allowed_days,
      business_hours_start,
      business_hours_end,
      advance_reservation_days,
      max_reservation_days,
      max_reservations_per_day,
      concurrent_reservations,
      closed_dates,
      custom_hours,
    } = body;

    // Validation
    if (!allowed_days || !Array.isArray(allowed_days)) {
      return c.json({ error: '予約可能曜日を指定してください' }, 400);
    }
    if (!business_hours_start || !business_hours_end) {
      return c.json({ error: '営業時間を指定してください' }, 400);
    }

    const settings = {
      reservation_settings_id: 'default',
      allowed_days,
      business_hours_start,
      business_hours_end,
      advance_reservation_days: advance_reservation_days ?? 3,
      max_reservation_days: max_reservation_days || 90,
      max_reservations_per_day: max_reservations_per_day || 10,
      concurrent_reservations: concurrent_reservations || 1,
      closed_dates: closed_dates || [],
      custom_hours: custom_hours || {},
      updated_at: new Date().toISOString(),
    };

    await db.upsertReservationSettings(settings);
    
    console.log(`[予約設定更新] 曜日: [${allowed_days.join(', ')}], 時間: ${business_hours_start}-${business_hours_end}`);
    
    return c.json({ message: '予約設定を更新しました', settings });
  } catch (error) {
    console.log(`Update reservation settings error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Public API (認証不要) ==========

// Health check endpoint (public) — プレフィックスあり・なしの両方で登録（Supabase 本番の path に合わせる）
const publicHealthHandler = (c: any) => c.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  message: 'Public API is working',
});
app.get('/make-server-fe84bde0/public/health', publicHealthHandler);
app.get('/public/health', publicHealthHandler);

// Get menu items (public) - optionally filter by location
app.get('/make-server-fe84bde0/public/menu-items', async (c) => {
  try {
    const locationId = c.req.query('location_id');
    const menuItems = await db.getMenuItems();
    
    let activeMenuItems = menuItems.filter((m: any) => m.is_active === true);
    
    // 店舗IDが指定されている場合、その店舗で有効なメニューのみを返す
    if (locationId) {
      const locationMenus = await db.getLocationMenus(locationId);
      const enabledMenuIds = locationMenus
        .filter((lm: any) => lm.enabled === true)
        .map((lm: any) => lm.menu_item_id);
      
      activeMenuItems = activeMenuItems.filter((m: any) => 
        enabledMenuIds.includes(m.menu_item_id)
      );
      
      console.log(`[Public Menu] Location ${locationId}: Total ${menuItems.length}, Active ${activeMenuItems.length}`);
    } else {
      console.log(`[Public Menu] Total: ${menuItems.length}, Active: ${activeMenuItems.length}`);
    }
    
    return c.json({ menu_items: activeMenuItems });
  } catch (error) {
    console.log(`Get public menu items error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get locations (public)
app.get('/make-server-fe84bde0/public/locations', async (c) => {
  try {
    const locations = await db.getLocations();
    const activeLocations = locations.filter((l: any) => l.active_flag !== false);
    return c.json({ locations: activeLocations });
  } catch (error) {
    console.log(`Get public locations error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get reservation settings (public)
app.get('/make-server-fe84bde0/public/reservation-settings', async (c) => {
  try {
    let settings = await db.getReservationSettings();
    
    // If no settings exist, return default settings
    if (!settings) {
      settings = {
        reservation_settings_id: 'default',
        allowed_days: [1, 2, 3, 4, 5, 6], // 月～土（日曜除く）
        business_hours_start: '09:00',
        business_hours_end: '18:00',
        advance_reservation_days: 3, // 3日前まで予約不可
        max_reservation_days: 90,
        max_reservations_per_day: 10,
        concurrent_reservations: 1,
        closed_dates: [],
        custom_hours: {},
        updated_at: new Date().toISOString(),
      };
    }
    
    return c.json({ settings });
  } catch (error) {
    console.log(`Get public reservation settings error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get booked time slots (public) - 予約済み時間枠の取得
app.get('/make-server-fe84bde0/public/booked-slots', async (c) => {
  try {
    const date = c.req.query('date'); // YYYY-MM-DD format
    const locationId = c.req.query('location_id');
    
    if (!date) {
      return c.json({ error: '日付が指定されていません' }, 400);
    }
    
    const dateReservations = await db.getReservationsByDate(date, locationId || undefined);
    const menuItems = await db.getMenuItems();

    // Get all location IDs that are booked on this date (always return for all locations)
    const bookedLocationIds = [...new Set(dateReservations.map((r: any) => r.location_id))];
    
    // Filter reservations by location for time slots
    const bookedSlots = dateReservations
      .filter((r: any) => {
        // If checking specific location, filter by that location
        // If no location specified, return all reservations
        if (locationId && r.location_id !== locationId) return false;
        return true;
      })
      .map((r: any) => {
        const dt = new Date(r.reservation_date_time);
        const hours = String(dt.getHours()).padStart(2, '0');
        const minutes = String(dt.getMinutes()).padStart(2, '0');
        
        // Get menu duration
        const menu = menuItems.find((m: any) => m.menu_item_id === r.menu_item_id);
        const duration = menu?.duration_minutes || r.duration_minutes || 60;
        
        return {
          time: `${hours}:${minutes}`,
          duration: duration,
          location_id: r.location_id
        };
      });
    
    console.log(`[予約スロット] 日付: ${date}, 店舗ID: ${locationId || '全店舗'}, 予約数: ${bookedSlots.length}, 予約店舗: [${bookedLocationIds.join(', ')}]`);
    
    return c.json({ 
      booked_slots: bookedSlots,
      booked_location_ids: bookedLocationIds
    });
  } catch (error) {
    console.log(`Get booked slots error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Create public reservation (public)
app.post('/make-server-fe84bde0/public/reservations', async (c) => {
  try {
    const body = await c.req.json();
    const {
      reservation_date_time,
      menu_item_id,
      location_id,
      parent_name,
      parent_name_kana,
      child_name,
      child_name_kana,
      child_age_years,
      child_age_months,
      postal_code,
      address_text,
      phone,
      email,
      notes_customer,
    } = body;

    // Validation
    if (!reservation_date_time || !menu_item_id || !location_id || !parent_name || !child_name || !phone || !email) {
      return c.json({ error: '必須項目が入力されていません' }, 400);
    }

    // Get reservation settings
    const settings = await db.getReservationSettings();
    
    // Check if date is a closed date
    if (settings?.closed_dates) {
      const reservationDate = new Date(reservation_date_time);
      const dateStr = reservationDate.toISOString().split('T')[0];
      if (settings.closed_dates.includes(dateStr)) {
        return c.json({ error: 'この日は休業日です。別の日をお選びください。' }, 400);
      }
    }

    // Check for time slot conflicts considering duration
    const reservations = await db.getReservations();
    const menuItems = await db.getMenuItems();
    
    // Get the duration of the new reservation
    const newMenu = menuItems.find((m: any) => m.menu_item_id === menu_item_id);
    const newDuration = newMenu?.duration_minutes || 60;
    
    const newDateTime = new Date(reservation_date_time);
    const newStartMinutes = newDateTime.getHours() * 60 + newDateTime.getMinutes();
    const newEndMinutes = newStartMinutes + newDuration;
    
    // Check daily reservation limit
    const maxReservationsPerDay = settings?.max_reservations_per_day || 10;
    const dateReservations = reservations.filter((r: any) => {
      if (r.status === 'cancelled') return false;
      const rDate = new Date(r.reservation_date_time);
      return rDate.toDateString() === newDateTime.toDateString();
    });
    
    if (dateReservations.length >= maxReservationsPerDay) {
      return c.json({ 
        error: `この日の予約は上限（${maxReservationsPerDay}件）に達しています。別の日をお選びください。` 
      }, 400);
    }
    
    // Check concurrent reservations limit
    const maxConcurrent = settings?.concurrent_reservations || 1;
    let overlappingCount = 0;
    
    for (const r of reservations) {
      if (r.status === 'cancelled') continue;
      if (r.location_id !== location_id) continue;
      
      const existingDateTime = new Date(r.reservation_date_time);
      
      // Check if dates are the same
      if (existingDateTime.toDateString() !== newDateTime.toDateString()) continue;
      
      // Get existing reservation's duration
      const existingMenu = menuItems.find((m: any) => m.menu_item_id === r.menu_item_id);
      const existingDuration = existingMenu?.duration_minutes || r.duration_minutes || 60;
      
      const existingStartMinutes = existingDateTime.getHours() * 60 + existingDateTime.getMinutes();
      const existingEndMinutes = existingStartMinutes + existingDuration;
      
      // Check for time overlap
      const hasOverlap = 
        (newStartMinutes >= existingStartMinutes && newStartMinutes < existingEndMinutes) ||
        (newEndMinutes > existingStartMinutes && newEndMinutes <= existingEndMinutes) ||
        (newStartMinutes <= existingStartMinutes && newEndMinutes >= existingEndMinutes);
      
      if (hasOverlap) {
        overlappingCount++;
        console.log(`[予約重複検出] 新規: ${reservation_date_time} (${newDuration}分), 既存: ${r.reservation_date_time} (${existingDuration}分)`);
      }
    }

    if (overlappingCount >= maxConcurrent) {
      return c.json({ 
        error: `この時間帯は予約が満席です（上限: ${maxConcurrent}組）。別の時間をお選びください。` 
      }, 409);
    }

    // Check if customer already exists by phone
    let customer = null;
    const customers = await db.getCustomers({ activeOnly: false });
    const existingCustomer = customers.find((c: any) => c.phone === phone && c.active_flag !== false);

    if (existingCustomer) {
      // Update existing customer
      customer = {
        ...existingCustomer,
        parent_name,
        parent_name_kana: parent_name_kana || existingCustomer.parent_name_kana,
        child_name,
        child_name_kana: child_name_kana || existingCustomer.child_name_kana,
        child_age_years: child_age_years !== null && child_age_years !== undefined ? child_age_years : existingCustomer.child_age_years,
        child_age_months: child_age_months !== null && child_age_months !== undefined ? child_age_months : existingCustomer.child_age_months,
        postal_code: postal_code || existingCustomer.postal_code,
        address_text: address_text || existingCustomer.address_text,
        email: email || existingCustomer.email,
        updated_at: new Date().toISOString(),
      };
      await db.upsertCustomer(customer);
    } else {
      // Create new customer
      const customerId = crypto.randomUUID();
      const allCustomers = await db.getCustomers({ activeOnly: false });
      const maxCode = allCustomers.reduce((max: number, c: any) => {
        const match = c.customer_code?.match(/A-(\\d+)/);
        if (match) {
          const num = parseInt(match[1]);
          return num > max ? num : max;
        }
        return max;
      }, 1000);
      const customerCode = `A-${maxCode + 1}`;

      // 月齢が入力されていて歳が空の場合は0をセット
      let finalAgeYears = child_age_years !== null && child_age_years !== undefined ? child_age_years : null;
      const hasMonths = child_age_months !== null && child_age_months !== undefined;
      if (finalAgeYears === null && hasMonths) {
        finalAgeYears = 0;
      }

      customer = {
        customer_id: customerId,
        customer_code: customerCode,
        external_customer_number: null,
        parent_name,
        parent_name_kana: parent_name_kana || null,
        child_name,
        child_name_kana: child_name_kana || null,
        child_age_years: finalAgeYears,
        child_age_months: hasMonths ? child_age_months : null,
        phone,
        email,
        line_url: null,
        postal_code,
        address_text,
        notes_internal: notes_customer ? `お客様からの備考: ${notes_customer}` : null,
        active_flag: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.upsertCustomer(customer);
    }

    // Create reservation
    const reservationId = crypto.randomUUID();
    const menuItem = await db.getMenuItem(menu_item_id);
    
    // Generate a unique 5-character lowercase alphanumeric reservation number
    const allReservations = await db.getReservations();
    const existingNumbers = new Set(allReservations.map((r: any) => r.reservation_number));
    
    let reservationNumber: string;
    let attempts = 0;
    const maxAttempts = 100;
    
    do {
      // Generate random 5-character lowercase alphanumeric string
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      reservationNumber = Array.from({ length: 5 }, () => 
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join('');
      attempts++;
      
      if (attempts >= maxAttempts) {
        throw new Error('予約番号の生成に失敗しました。時間をおいて再度お試しください。');
      }
    } while (existingNumbers.has(reservationNumber));

    const reservationData = {
      reservation_id: reservationId,
      reservation_number: reservationNumber,
      reservation_date_time,
      duration_minutes: menuItem?.duration_minutes || 60,
      location_id,
      customer_id: customer.customer_id,
      staff_id_main: null,
      status: 'confirmed', // 予約確定
      payment_status: 'unpaid',
      payment_method: null,
      work_required: menuItem?.name || null,
      notes_staff: notes_customer ? `お客様備考: ${notes_customer}` : '公開予約フォームから登録',
      menu_item_id,
      additional_units: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by_user_id: null, // Public reservation
    };

    await db.upsertReservation(reservationData);

    // Sync to Google Calendar (public reservation)
    try {
      console.log('[Public Reservation] Calendar sync starting', { reservationId });
      const locationForCal = await db.getLocation(location_id);
      const eventId = await syncToGoogleCalendar('create', reservationData, customer, menuItem, locationForCal);
      console.log('[Public Reservation] Calendar sync result', { eventId, reservationId });
      if (eventId) {
        reservationData.google_event_id = eventId;
        await db.upsertReservation(reservationData);
      }
    } catch (calError) {
      console.error('[Public Reservation] Calendar sync failed:', calError);
    }

    // Send confirmation email using Brevo (Sendinblue)
    try {
      const brevoApiKey = Deno.env.get('BREVO_API_KEY');
      console.log('[予約メール送信] BREVO_API_KEY存在:', !!brevoApiKey);
      console.log('[予約メール送信] 送信先メールアドレス:', email);
      
      if (brevoApiKey) {
        const location = await db.getLocation(location_id);
        const reservationDate = new Date(reservation_date_time);
        const dateStr = reservationDate.toLocaleDateString('ja-JP', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          weekday: 'short'
        });
        const timeStr = reservationDate.toLocaleTimeString('ja-JP', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        console.log('[予約メール送信] メニュー:', menuItem?.name);
        console.log('[予約メール送信] 店舗:', location?.location_name);

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
      line-height: 1.8; 
      color: #2C2C2C;
      background-color: #F8F6F3;
      padding: 20px;
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background: #FFFFFF;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(196, 169, 98, 0.1);
    }
    .header { 
      background: linear-gradient(135deg, #C4A962 0%, #D4B982 100%);
      color: white; 
      padding: 40px 30px; 
      text-align: center;
    }
    .header h1 { 
      font-family: 'Noto Serif JP', serif;
      font-size: 32px;
      margin-bottom: 8px;
      letter-spacing: 0.05em;
    }
    .header p { 
      font-size: 14px;
      opacity: 0.95;
      letter-spacing: 0.1em;
    }
    .content { 
      background: #FFFFFF; 
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #2C2C2C;
      margin-bottom: 24px;
      font-family: 'Noto Serif JP', serif;
    }
    .message {
      color: #666666;
      margin-bottom: 32px;
      line-height: 1.8;
    }
    .info-box { 
      background: #F8F6F3;
      padding: 24px; 
      margin: 28px 0; 
      border-radius: 8px; 
      border-left: 4px solid #C4A962;
    }
    .info-row { 
      margin: 14px 0;
      display: flex;
      align-items: flex-start;
    }
    .label { 
      font-weight: 600;
      color: #C4A962;
      min-width: 100px;
      flex-shrink: 0;
    }
    .value {
      color: #2C2C2C;
      flex: 1;
    }
    .notice-box { 
      background: #FFF9E6;
      border: 1px solid #E5E0D8;
      border-left: 4px solid #C4A962;
      padding: 24px; 
      margin: 28px 0; 
      border-radius: 8px;
    }
    .notice-title {
      font-weight: 600;
      color: #2C2C2C;
      margin-bottom: 12px;
      font-size: 16px;
    }
    .notice-text {
      color: #666666;
      margin-bottom: 16px;
      line-height: 1.8;
    }
    .btn { 
      display: inline-block; 
      margin-top: 16px; 
      padding: 16px 36px; 
      background: #C4A962;
      color: white; 
      text-decoration: none; 
      border-radius: 8px; 
      font-weight: 600;
      font-size: 16px;
      transition: all 0.3s;
      letter-spacing: 0.05em;
    }
    .btn:hover {
      background: #B39952;
      box-shadow: 0 4px 12px rgba(196, 169, 98, 0.3);
    }
    .closing {
      color: #666666;
      margin-top: 32px;
      line-height: 1.8;
    }
    .footer { 
      text-align: center; 
      padding: 24px 30px;
      background: #F8F6F3;
      color: #999999;
      font-size: 13px;
      line-height: 1.6;
    }
    .divider {
      height: 1px;
      background: #E5E0D8;
      margin: 24px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Amorétto</h1>
      <p>ライフキャスティング専門店</p>
    </div>
    <div class="content">
      <div class="greeting">${parent_name} 様</div>
      
      <div class="message">
        この度はAmoréttoにご予約いただき、誠にありがとうございます。<br>
        以下の内容で仮予約を承りました。
      </div>
      
      <div class="info-box">
        <div class="info-row">
          <span class="label">予約番号</span>
          <span class="value" style="font-family: monospace; font-size: 18px; font-weight: 600; color: #C4A962;">${reservationNumber}</span>
        </div>
        <div class="divider"></div>
        <div class="info-row">
          <span class="label">予約日時</span>
          <span class="value">${dateStr} ${timeStr}</span>
        </div>
        <div class="info-row">
          <span class="label">メニュー</span>
          <span class="value">${menuItem?.name || '-'}</span>
        </div>
        <div class="info-row">
          <span class="label">店舗</span>
          <span class="value">${location?.location_name || '-'}</span>
        </div>
        <div class="divider"></div>
        <div class="info-row">
          <span class="label">保護者様</span>
          <span class="value">${parent_name}${parent_name_kana ? ` （${parent_name_kana}）` : ''}</span>
        </div>
        <div class="info-row">
          <span class="label">お子様</span>
          <span class="value">${child_name}${child_name_kana ? ` （${child_name_kana}）` : ''}${child_age_years !== null || child_age_months !== null ? ` (${child_age_years || 0}歳${child_age_months ? ` ${child_age_months}ヶ月` : ''})` : ''}</span>
        </div>
      </div>

      <div class="notice-box">
        <div class="notice-title">📋 ご来店前のお願い</div>
        <div class="notice-text">
          ・予約時間の10分前までにご来店ください<br>
          ・遅れる場合は必ずお電話にてご連絡ください<br>
          ・ご予約の変更・キャンセルをご希望の場合は、お電話・メール・公式LINEにてご連絡ください<br>
          ・当日キャンセルの場合はキャンセル料が発生する場合がございます
        </div>
      </div>

      <div class="notice-box" style="background: linear-gradient(135deg, #E8F8F5 0%, #E1F5FE 100%); border-left: 4px solid #06C755;">
        <div class="notice-title" style="color: #06C755;">💬 公式LINE</div>
        <div class="notice-text">
          変更・キャンセルは公式LINEからも受け付けております<br>
          <a href="https://lin.ee/LbmijXx" style="color: #06C755; text-decoration: underline;">https://lin.ee/LbmijXx</a>
        </div>
      </div>

      <div class="closing">
        ご不明な点がございましたら、お気軽にお問い合わせください。<br>
        スタッフ一同、心よりお待ちしております。
      </div>
    </div>
    
    <div class="footer">
      Amorétto ライフキャスティング専門店<br>
      このメールは送信専用です。ご返信いただいてもお答えできませんのでご了承ください。
    </div>
  </div>
</body>
</html>
        `;

        console.log('[予約メール送信] Brevo APIを呼び出し中...');
        
        // Brevo API endpoint
        const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'api-key': brevoApiKey,
          },
          body: JSON.stringify({
            sender: {
              name: 'Amorétto LifeCastingstudio',
              email: 'lifecasting.timecapsule@gmail.com'
            },
            to: [
              {
                email: email,
                name: parent_name
              }
            ],
            subject: `【アマレット】ご予約を承りました（予約番号: ${reservationNumber}）`,
            htmlContent: emailHtml,
          }),
        });

        console.log('[予約メール送信] Brevo APIレスポンスステータス:', emailResponse.status);

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json();
          console.error('[予約メール送信] メール送信失敗:', errorData);
          console.error('[予約メール送信] エラー詳細:', JSON.stringify(errorData));
        } else {
          const successData = await emailResponse.json();
          console.log('[予約メール送信] ✅ メール送信成功:', email);
          console.log('[予約メール送信] メッセージID:', successData.messageId);
        }
      } else {
        console.log('[予約メール送信] ⚠️ BREVO_API_KEYが設定されていません。メール送信をスキップします。');
      }
    } catch (emailError) {
      console.error('[予約メール送信] ❌ メール送信エラー:', emailError);
      console.error('[予約メール送信] エラースタック:', emailError.stack);
      // Don't fail the reservation if email fails
    }

    // Get location details for response
    const location = await db.getLocation(location_id);
    
    return c.json({ 
      success: true, 
      reservation: {
        reservation_id: reservationId,
        reservation_number: reservationNumber,
        reservation_date_time,
        duration_minutes: reservationData.duration_minutes,
        customer_id: customer.customer_id,
        customer_code: customer.customer_code,
        parent_name,
        parent_name_kana,
        child_name,
        child_name_kana,
        child_age_years,
        child_age_months,
        phone,
        email,
        notes_customer,
        menu_name: menuItem?.name || '',
        location_name: location?.location_name || '',
        location_address: location?.address_text || '',
        status: reservationData.status,
      },
      message: 'ご予約を承りました。確認メールをお送りしましたのでご確認ください。'
    });

  } catch (error) {
    console.log(`Create public reservation error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});



// Delete customer and all related data (admin only)
app.delete('/make-server-fe84bde0/customers/:customer_id', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const customerId = c.req.param('customer_id');
    if (!customerId) {
      return c.json({ error: 'customer_id is required' }, 400);
    }

    const customer = await db.getCustomer(customerId);
    if (!customer) {
      return c.json({ error: 'Customer not found' }, 404);
    }

    console.log(`[顧客削除] 開始: ${customer.customer_code} (${customer.parent_name})`);

    // 関連データを取得
    const reservations = await db.getReservations();
    const workOrders = await db.getWorkOrders();
    const incentives = await db.getIncentives();

    // この顧客に関連する予約を削除
    const customerReservations = reservations.filter((r: any) => r.customer_id === customerId);
    for (const reservation of customerReservations) {
      await db.deleteReservation(reservation.reservation_id);
      console.log(`[顧客削除] 予約削除: ${reservation.reservation_number || reservation.reservation_id}`);
    }

    // この顧客に関連する制作物を削除
    const customerWorkOrders = workOrders.filter((wo: any) => wo.customer_id === customerId);
    for (const workOrder of customerWorkOrders) {
      await db.deleteWorkOrder(workOrder.work_order_id);
      console.log(`[顧客削除] 制作物削除: ${workOrder.product_name}`);
    }

    // この顧客に関連するインセンティブを削除（予約IDベース）
    const reservationIds = customerReservations.map((r: any) => r.reservation_id);
    const customerIncentives = incentives.filter((inc: any) => 
      reservationIds.includes(inc.reservation_id)
    );
    for (const incentive of customerIncentives) {
      await db.deleteIncentive(incentive.incentive_id);
      console.log(`[顧客削除] インセンティブ削除: ${incentive.incentive_id}`);
    }

    // 顧���データを削除
    await db.deleteCustomer(customerId);
    console.log(`[顧客削除] 顧客削除完了: ${customer.customer_code}`);

    // 監査ログを記録
    await db.insertAuditLog({
      ref_table: 'customers',
      ref_id: customerId,
      action_type: 'delete',
      before_json: {
        customer_code: customer.customer_code,
        parent_name: customer.parent_name,
        child_name: customer.child_name,
        deleted_reservations: customerReservations.length,
        deleted_work_orders: customerWorkOrders.length,
        deleted_incentives: customerIncentives.length,
      },
      acted_by_user_id: user.id,
      acted_at: new Date().toISOString(),
    });

    return c.json({ 
      success: true,
      deleted: {
        customer: 1,
        reservations: customerReservations.length,
        work_orders: customerWorkOrders.length,
        incentives: customerIncentives.length,
      },
      message: `顧客「${customer.customer_code}」と関連データを削除しました`
    });
  } catch (error) {
    console.log(`Delete customer error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get location availability settings
app.get('/make-server-fe84bde0/location-availability/:location_id', async (c) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const location_id = c.req.param('location_id');
    const availability = await db.getLocationAvailability(location_id);

    return c.json({ availability: availability || null });
  } catch (error) {
    console.log(`Get location availability error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Get location availability settings (public)
app.get('/make-server-fe84bde0/public/location-availability/:location_id', async (c) => {
  try {
    const location_id = c.req.param('location_id');
    const availability = await db.getLocationAvailability(location_id);

    return c.json({ availability: availability || null });
  } catch (error) {
    console.log(`Get public location availability error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Save location availability settings
app.post('/make-server-fe84bde0/location-availability', async (c) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const {
      location_id,
      regular_closed_days,
      business_hours_start,
      business_hours_end,
      custom_hours,
      closed_dates,
      special_dates,
      max_reservations_per_day,
    } = body;

    if (!location_id) {
      return c.json({ error: 'location_id is required' }, 400);
    }

    const availabilityData = {
      location_id,
      regular_closed_days: regular_closed_days || [],
      business_hours_start: business_hours_start || '09:00',
      business_hours_end: business_hours_end || '18:00',
      custom_hours: custom_hours || {},
      closed_dates: closed_dates || [],
      special_dates: special_dates || {},
      max_reservations_per_day: max_reservations_per_day || 10,
      updated_at: new Date().toISOString(),
    };

    await db.upsertLocationAvailability(availabilityData);

    console.log(`[店舗可用性設定] 店舗ID: ${location_id}`);

    return c.json({ 
      success: true,
      message: '設定を保存しました',
      availability: availabilityData,
    });
  } catch (error) {
    console.log(`Save location availability error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Data Integrity ==========

// Check and fix data integrity
app.post('/make-server-fe84bde0/integrity-check', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const mode = c.req.query('mode') || 'check'; // check or fix
    const report: any = { issues: [], fixed: [] };

    // 1. Check Reservation <-> Work Order links
    const reservations = await db.getReservations();
    const workOrders = await db.getWorkOrders();
    
    // Check for work orders with missing reservations
    for (const wo of workOrders) {
      const res = reservations.find((r: any) => r.reservation_id === wo.reservation_id);
      if (!res) {
         report.issues.push(`WorkOrder ${wo.work_order_id} (Product: ${wo.product_type}) points to missing Reservation ${wo.reservation_id}`);
      }
    }
    
    return c.json({ report });
  } catch (error) {
     console.log(`Integrity check error: ${error}`);
     return c.json({ error: String(error) }, 500);
  }
});

Deno.serve(app.fetch);
