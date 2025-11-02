import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';

const app = new Hono();

app.use('*', cors());
app.use('*', logger(console.log));

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

// ========== Auth Helpers ==========
async function getAuthUser(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    console.log('[Auth] No Authorization header found');
    return null;
  }
  
  console.log('[Auth] Authorization header present');
  const accessToken = authHeader.split(' ')[1];
  if (!accessToken) {
    console.log('[Auth] No access token in Authorization header');
    return null;
  }
  
  console.log('[Auth] Access token extracted, length:', accessToken.length);
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error) {
    console.log(`[Auth] Supabase auth error: ${error.message}`);
    return null;
  }
  if (!user) {
    console.log('[Auth] No user found for token');
    return null;
  }
  
  console.log('[Auth] User authenticated successfully:', user.id);
  return user;
}

async function getUserRole(userId: string) {
  const userData = await kv.get(`user:${userId}`);
  return userData?.role || null;
}

// ========== Auth Routes ==========

// Login with login_id
app.post('/make-server-fe84bde0/login', async (c) => {
  try {
    const body = await c.req.json();
    const { login_id, password } = body;

    // Find user by login_id
    const users = await kv.getByPrefix('user:');
    const user = users.find((u: any) => u.login_id === login_id && u.active_flag !== false);

    if (!user) {
      console.log(`Login failed: User with login_id ${login_id} not found`);
      return c.json({ error: 'ログインIDまたはパスワードが正しくありません' }, 401);
    }

    // Authenticate with Supabase using email
    const { data, error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (error) {
      console.log(`Login authentication error: ${error.message}`);
      return c.json({ error: 'ログインIDまたはパスワードが正しくありません' }, 401);
    }

    return c.json({
      success: true,
      access_token: data.session.access_token,
      user: {
        user_id: user.user_id,
        name: user.name,
        login_id: user.login_id,
        role: user.role,
      },
    });
  } catch (error) {
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

    // Check if login_id already exists
    const users = await kv.getByPrefix('user:');
    const existingUser = users.find((u: any) => u.login_id === login_id);
    if (existingUser) {
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

    // Store user profile in KV store
    await kv.set(`user:${userId}`, {
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
    console.log('[/me] Request received');
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      console.log('[/me] Authentication failed');
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log('[/me] User authenticated, fetching user data for:', user.id);
    const userData = await kv.get(`user:${user.id}`);
    if (!userData) {
      console.log('[/me] User data not found in KV store for:', user.id);
      return c.json({ error: 'User not found' }, 404);
    }

    console.log('[/me] User data found, returning:', userData.user_id);
    return c.json({ user: userData });
  } catch (error) {
    console.log(`[/me] Error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Initialize system - Create default admin account (初回セットアップ用)
app.post('/make-server-fe84bde0/initialize', async (c) => {
  try {
    console.log('System initialization requested...');
    
    // Check if any users exist in KV store
    const users = await kv.getByPrefix('user:');
    if (users.length > 0) {
      return c.json({ 
        error: 'システムは既に初期化されています。ユーザーが存在します。',
        existing_users: users.length 
      }, 400);
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
    
    // Store admin profile in KV store
    await kv.set(`user:${userId}`, {
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
    
    return c.json({ 
      success: true,
      message: '初期管理者アカウントが作成されました',
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

// ========== Locations ==========

// Get all locations
app.get('/make-server-fe84bde0/locations', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const locations = await kv.getByPrefix('location:');
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

    await kv.set(`location:${locationData.location_id}`, locationData);
    return c.json({ success: true, location: locationData });
  } catch (error) {
    console.log(`Create/Update location error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Customers ==========

// Get all customers
app.get('/make-server-fe84bde0/customers', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const customers = await kv.getByPrefix('customer:');
    return c.json({ customers: customers.filter((c: any) => c.active_flag !== false) });
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
    
    const customers = await kv.getByPrefix('customer:');
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
        (cust.parent_name_kana && cust.parent_name_kana.toLowerCase().includes(searchName))
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
      phone,
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
      const allCustomers = await kv.getByPrefix('customer:');
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
      const existingCustomer = await kv.get(`customer:${customerId}`);
      if (existingCustomer) {
        customerCode = existingCustomer.customer_code;
        createdAt = existingCustomer.created_at;
      }
    }

    const customerData = {
      customer_id: customerId,
      customer_code: customerCode,
      external_customer_number: external_customer_number || null,
      parent_name,
      parent_name_kana: parent_name_kana || null,
      child_name,
      child_name_kana: child_name_kana || null,
      child_age_years: child_age_years !== null && child_age_years !== undefined ? child_age_years : null,
      child_age_months: child_age_months !== null && child_age_months !== undefined ? child_age_months : null,
      phone,
      line_url: line_url || null,
      postal_code,
      address_text,
      notes_internal,
      active_flag: true,
      created_at: createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`customer:${customerId}`, customerData);

    // Audit log
    await kv.set(`audit:${crypto.randomUUID()}`, {
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

// ========== Reservations ==========

// Get all reservations
app.get('/make-server-fe84bde0/reservations', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const reservations = await kv.getByPrefix('reservation:');
    return c.json({ reservations });
  } catch (error) {
    console.log(`Get reservations error: ${error}`);
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
    } = body;

    const reservationId = reservation_id || crypto.randomUUID();

    const reservationData = {
      reservation_id: reservationId,
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
      created_at: body.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by_user_id: user.id,
    };

    await kv.set(`reservation:${reservationId}`, reservationData);

    // Audit log
    await kv.set(`audit:${crypto.randomUUID()}`, {
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
    const reservation = await kv.get(`reservation:${reservationId}`);

    await kv.del(`reservation:${reservationId}`);

    // Audit log
    await kv.set(`audit:${crypto.randomUUID()}`, {
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

// ========== Work Orders ==========

// Get all work orders
app.get('/make-server-fe84bde0/work-orders', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const workOrders = await kv.getByPrefix('work_order:');
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
      reservation_id,
      product_type,
      status,
      due_date,
      delivered_date,
      priority_order,
      notes_internal,
    } = body;

    const workOrderId = work_order_id || crypto.randomUUID();

    const workOrderData = {
      work_order_id: workOrderId,
      reservation_id,
      product_type,
      status: status || '制作中',
      due_date,
      delivered_date,
      priority_order: priority_order ?? null,
      notes_internal,
      created_at: body.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by_user_id: user.id,
    };

    await kv.set(`work_order:${workOrderId}`, workOrderData);

    // Audit log
    await kv.set(`audit:${crypto.randomUUID()}`, {
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
      const workOrder = await kv.get(`work_order:${item.work_order_id}`);
      if (workOrder) {
        workOrder.priority_order = item.priority_order;
        workOrder.updated_at = new Date().toISOString();
        workOrder.updated_by_user_id = user.id;
        await kv.set(`work_order:${item.work_order_id}`, workOrder);
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.log(`Reorder work orders error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Incentives ==========

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

    // Get all work orders and reservations
    const workOrders = await kv.getByPrefix('work_order:');
    const reservations = await kv.getByPrefix('reservation:');

    // Build incentive data for each staff
    const incentivesMap = new Map();

    for (const wo of workOrders) {
      const reservation = reservations.find((r: any) => r.reservation_id === wo.reservation_id);
      if (!reservation || !reservation.staff_id_main) continue;

      const staffId = reservation.staff_id_main;
      const deliveredDate = wo.delivered_date ? new Date(wo.delivered_date) : null;
      const woYearMonth = deliveredDate ? deliveredDate.toISOString().slice(0, 7) : null;

      if (!incentivesMap.has(staffId)) {
        incentivesMap.set(staffId, {
          user_id: staffId,
          pending: [],
          confirmed: [],
        });
      }

      const staffData = incentivesMap.get(staffId);

      if (wo.status === 'お渡し待ち') {
        staffData.pending.push(wo);
      } else if (wo.status === '引渡し済' && woYearMonth === yearMonth) {
        staffData.confirmed.push(wo);
      }
    }

    // Get manual adjustments
    const adjustments = await kv.getByPrefix(`incentive_monthly:`);

    const results = [];
    for (const [staffId, data] of incentivesMap) {
      // Skip if not the target user (for staff role)
      if (role !== 'admin' && staffId !== user.id) continue;
      if (targetUserId && staffId !== targetUserId) continue;

      const adjustment = adjustments.find((a: any) => a.user_id === staffId && a.year_month === yearMonth);

      results.push({
        user_id: staffId,
        year_month: yearMonth,
        count_pending: data.pending.length,
        amount_pending: data.pending.length * 1000,
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

    const key = `incentive_monthly:${user_id}:${year_month}`;
    const existing = await kv.get(key) || {};

    const incentiveData = {
      ...existing,
      user_id,
      year_month,
      locked_flag,
      manual_adjust_yen: manual_adjust_yen ?? existing.manual_adjust_yen ?? 0,
      locked_at: locked_flag ? new Date().toISOString() : existing.locked_at,
      adjusted_by_user_id: user.id,
      updated_at: new Date().toISOString(),
    };

    await kv.set(key, incentiveData);

    // Audit log
    await kv.set(`audit:${crypto.randomUUID()}`, {
      ref_table: 'incentives_monthly',
      ref_id: key,
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

    const users = await kv.getByPrefix('user:');
    return c.json({ users });
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

    const userData = await kv.get(`user:${user_id}`);
    if (!userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    userData.name = name ?? userData.name;
    userData.role = newRole ?? userData.role;
    userData.active_flag = active_flag ?? userData.active_flag;
    
    // Update login_id if provided
    if (update_login_id) {
      userData.login_id = update_login_id;
    }
    
    // Update password in Supabase Auth if provided
    if (update_password) {
      const { error: passwordError } = await supabase.auth.admin.updateUserById(
        user_id,
        { password: update_password }
      );
      
      if (passwordError) {
        console.error(`Failed to update password: ${passwordError.message}`);
        return c.json({ error: `パスワード更新に失敗しました: ${passwordError.message}` }, 500);
      }
    }
    
    userData.updated_at = new Date().toISOString();

    await kv.set(`user:${user_id}`, userData);

    return c.json({ success: true, user: userData });
  } catch (error) {
    console.log(`Update user error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Menu Items ==========

// Get all menu items
app.get('/make-server-fe84bde0/menu-items', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const menuItems = await kv.getByPrefix('menu_item:');
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
      is_active,
    } = body;

    const menuItemId = menu_item_id || crypto.randomUUID();

    const menuItemData = {
      menu_item_id: menuItemId,
      name,
      base_price,
      additional_unit_price,
      description: description || '',
      is_active: is_active ?? true,
      created_at: body.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`menu_item:${menuItemId}`, menuItemData);

    // Audit log
    await kv.set(`audit:${crypto.randomUUID()}`, {
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
    const menuItem = await kv.get(`menu_item:${menuItemId}`);

    await kv.del(`menu_item:${menuItemId}`);

    // Audit log
    await kv.set(`audit:${crypto.randomUUID()}`, {
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

// ========== Staff (alias for users, for compatibility) ==========

// Get all staff
app.get('/make-server-fe84bde0/staff', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const users = await kv.getByPrefix('user:');
    // Filter active users only
    const activeUsers = users.filter((u: any) => u.active_flag !== false);
    return c.json({ staff: activeUsers });
  } catch (error) {
    console.log(`Get staff error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// ========== Dashboard ==========

// Get dashboard data
app.get('/make-server-fe84bde0/dashboard', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get work orders
    const workOrders = await kv.getByPrefix('work_order:');
    const reservations = await kv.getByPrefix('reservation:');
    const customers = await kv.getByPrefix('customer:');

    // Filter non-delivered work orders
    const activeWorkOrders = workOrders.filter((wo: any) => wo.status !== '引渡し済');

    // Sort by priority
    const sortedWorkOrders = activeWorkOrders.sort((a: any, b: any) => {
      // First by priority_order (if set)
      if (a.priority_order !== null && b.priority_order !== null) {
        return a.priority_order - b.priority_order;
      }
      if (a.priority_order !== null) return -1;
      if (b.priority_order !== null) return 1;

      // Then by due_date
      const aDate = new Date(a.due_date);
      const bDate = new Date(b.due_date);
      if (aDate < bDate) return -1;
      if (aDate > bDate) return 1;

      // Then by reservation date
      const aReservation = reservations.find((r: any) => r.reservation_id === a.reservation_id);
      const bReservation = reservations.find((r: any) => r.reservation_id === b.reservation_id);
      if (aReservation && bReservation) {
        const aResDate = new Date(aReservation.reservation_date_time);
        const bResDate = new Date(bReservation.reservation_date_time);
        return aResDate.getTime() - bResDate.getTime();
      }

      return 0;
    });

    // Top 5 priority work orders
    const topWorkOrders = sortedWorkOrders.slice(0, 5).map((wo: any) => {
      const reservation = reservations.find((r: any) => r.reservation_id === wo.reservation_id);
      const customer = customers.find((c: any) => c.customer_id === reservation?.customer_id);
      return {
        ...wo,
        reservation,
        customer,
      };
    });

    // Today's reservations (in Japan timezone)
    const getJapanDateString = (date: Date) => {
      return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
        .toISOString()
        .slice(0, 10);
    };
    
    const today = getJapanDateString(new Date());
    const todayReservations = reservations.filter((r: any) => {
      const resDate = getJapanDateString(new Date(r.reservation_date_time));
      return resDate === today;
    }).map((r: any) => {
      const customer = customers.find((c: any) => c.customer_id === r.customer_id);
      return { ...r, customer };
    });

    // Tentative reservations (including modified status)
    const tentativeReservations = reservations.filter((r: any) => 
      r.status === 'tentative' || r.status === 'modified'
    ).map((r: any) => {
      const customer = customers.find((c: any) => c.customer_id === r.customer_id);
      return { ...r, customer };
    });

    return c.json({
      top_work_orders: topWorkOrders,
      today_reservations: todayReservations,
      tentative_reservations: tentativeReservations,
    });
  } catch (error) {
    console.log(`Get dashboard data error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

Deno.serve(app.fetch);
