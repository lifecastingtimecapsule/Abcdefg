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
    return null;
  }
  
  const accessToken = authHeader.split(' ')[1];
  if (!accessToken) {
    return null;
  }
  
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error) {
    // Token expired or invalid - this is normal behavior
    console.log(`[Auth] Token validation failed: ${error.message}`);
    return null;
  }
  if (!user) {
    return null;
  }
  
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

    // Update last login timestamp
    try {
      const updatedUser = {
        ...user,
        last_login_at: new Date().toISOString(),
      };
      await kv.set(`user:${user.user_id}`, updatedUser);
    } catch (updateError) {
      console.log(`Failed to update last login time: ${updateError}`);
      // Don't fail the login if we can't update the timestamp
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

    // Validate password length
    if (!password || password.length < 6) {
      return c.json({ error: 'パスワードは6文字以上で設定してください' }, 400);
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
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userData = await kv.get(`user:${user.id}`);
    if (!userData) {
      console.error(`[/me] User data not found in KV store for: ${user.id}`);
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ user: userData });
  } catch (error) {
    console.error(`[/me] Error: ${error}`);
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
    let customers = await kv.getByPrefix('customer:');
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

    // Auto-create work order if status is confirmed and work_required is set
    if (status === 'confirmed' && work_required && work_required.trim() !== '') {
      // Check if work order already exists for this reservation
      const existingWorkOrders = await kv.getByPrefix('work_order:');
      const existingWorkOrder = existingWorkOrders.find((wo: any) => wo.reservation_id === reservationId);

      if (!existingWorkOrder) {
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
          status: '制作中',
          due_date: dueDate.toISOString().split('T')[0],
          delivered_date: null,
          priority_order: null,
          notes_internal: '予約確定時に自動生成',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by_user_id: user.id,
        };

        await kv.set(`work_order:${workOrderId}`, workOrderData);

        console.log(`Auto-created work order ${workOrderId} for reservation ${reservationId}`);
      }
    }

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

// Batch create work orders for existing confirmed reservations (admin only)
app.post('/make-server-fe84bde0/reservations/batch-create-work-orders', async (c) => {
  try {
    const user = await getAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403);
    }

    const reservations = await kv.getByPrefix('reservation:');
    const workOrders = await kv.getByPrefix('work_order:');
    
    let createdCount = 0;
    const createdWorkOrders = [];

    for (const reservation of reservations) {
      // Check if reservation is confirmed and has work_required
      if (reservation.status === 'confirmed' && reservation.work_required && reservation.work_required.trim() !== '') {
        // Check if work order already exists
        const existingWorkOrder = workOrders.find((wo: any) => wo.reservation_id === reservation.reservation_id);
        
        if (!existingWorkOrder) {
          // Create work order
          const workOrderId = crypto.randomUUID();
          
          // Calculate due date: 14 days from reservation date
          const reservationDate = new Date(reservation.reservation_date_time);
          const dueDate = new Date(reservationDate);
          dueDate.setDate(dueDate.getDate() + 14);

          const workOrderData = {
            work_order_id: workOrderId,
            reservation_id: reservation.reservation_id,
            product_type: reservation.work_required,
            status: '制作中',
            due_date: dueDate.toISOString().split('T')[0],
            delivered_date: null,
            priority_order: null,
            notes_internal: '一括生成（既存予約の確定済み分）',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by_user_id: user.id,
          };

          await kv.set(`work_order:${workOrderId}`, workOrderData);
          createdCount++;
          createdWorkOrders.push(workOrderData);

          console.log(`Batch created work order ${workOrderId} for reservation ${reservation.reservation_id}`);
        }
      }
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

    // Check for duplicate work orders for the same reservation and product type (only for new work orders)
    if (!work_order_id && reservation_id) {
      const allWorkOrders = await kv.getByPrefix('work_order:');
      const duplicateExists = allWorkOrders.some((wo: any) => 
        wo.reservation_id === reservation_id && 
        wo.product_type === product_type &&
        wo.work_order_id !== workOrderId
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

    const reservations = await kv.getByPrefix('reservation:');
    const workOrders = await kv.getByPrefix('work_order:');
    const users = await kv.getByPrefix('user:');

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
    const reservations = await kv.getByPrefix('reservation:');

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
    const reservations = await kv.getByPrefix('reservation:');
    const users = await kv.getByPrefix('user:');
    const adjustments = await kv.getByPrefix('incentive_monthly:');

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
    const reservations = await kv.getByPrefix('reservation:');
    const adjustments = await kv.getByPrefix('incentive_monthly:');

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
      // Check if login_id is already taken by another user
      const users = await kv.getByPrefix('user:');
      const existingUser = users.find((u: any) => u.login_id === update_login_id && u.user_id !== user_id);
      if (existingUser) {
        return c.json({ error: 'このログインIDは既に使用されています' }, 400);
      }
      userData.login_id = update_login_id;
    }
    
    // Update password in Supabase Auth if provided
    if (update_password) {
      // Validate password length
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

    // Tentative and rescheduled reservations
    const tentativeReservations = reservations.filter((r: any) => 
      r.status === 'tentative' || r.status === 'rescheduled'
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
    const reservations = await kv.getByPrefix('reservation:');
    const menuItems = await kv.getByPrefix('menu_item:');
    const locations = await kv.getByPrefix('location:');
    const users = await kv.getByPrefix('user:');

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
    const dailySalesMap = new Map<string, { revenue: number; count: number }>();
    const monthlySalesMap = new Map<string, { revenue: number; count: number }>();
    const menuSalesMap = new Map<string, { revenue: number; count: number; menuName: string }>();
    const locationSalesMap = new Map<string, { revenue: number; count: number; locationName: string }>();
    const staffSalesMap = new Map<string, { revenue: number; count: number; staffName: string }>();

    for (const reservation of filteredReservations) {
      const menuItem = menuItems.find((m: any) => m.menu_item_id === reservation.menu_item_id);
      const price = menuItem ? (menuItem.base_price + (reservation.additional_units || 0) * menuItem.additional_unit_price) : 0;

      // Total revenue (all statuses except cancelled)
      if (reservation.status !== 'cancelled') {
        totalRevenue += price;

        // Confirmed revenue
        if (reservation.status === 'confirmed') {
          confirmedRevenue += price;
        }

        // Pending revenue
        if (reservation.status === 'tentative') {
          pendingRevenue += price;
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

        // Menu sales
        const menuId = reservation.menu_item_id || 'unknown';
        const menuName = menuItem?.name || 'メニュー不明';
        const menuData = menuSalesMap.get(menuId) || { revenue: 0, count: 0, menuName };
        menuData.revenue += price;
        menuData.count += 1;
        menuSalesMap.set(menuId, menuData);

        // Location sales
        const locationId = reservation.location_id || 'unknown';
        const location = locations.find((l: any) => l.location_id === locationId);
        const locationName = location?.name || '場所不明';
        const locationData = locationSalesMap.get(locationId) || { revenue: 0, count: 0, locationName };
        locationData.revenue += price;
        locationData.count += 1;
        locationSalesMap.set(locationId, locationData);

        // Staff sales
        const staffId = reservation.staff_id_main || 'unknown';
        const staff = users.find((u: any) => u.user_id === staffId);
        const staffName = staff?.name || 'スタッフ不明';
        const staffData = staffSalesMap.get(staffId) || { revenue: 0, count: 0, staffName };
        staffData.revenue += price;
        staffData.count += 1;
        staffSalesMap.set(staffId, staffData);
      } else {
        cancelledCount += 1;
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

    const menuSales = Array.from(menuSalesMap.entries())
      .map(([id, data]) => ({ name: data.menuName, revenue: data.revenue, count: data.count }))
      .sort((a, b) => b.revenue - a.revenue);

    const locationSales = Array.from(locationSalesMap.entries())
      .map(([id, data]) => ({ name: data.locationName, revenue: data.revenue, count: data.count }))
      .sort((a, b) => b.revenue - a.revenue);

    const staffSales = Array.from(staffSalesMap.entries())
      .map(([id, data]) => ({ name: data.staffName, revenue: data.revenue, count: data.count }))
      .sort((a, b) => b.revenue - a.revenue);

    // Calculate average order value (confirmed only)
    const confirmedCount = filteredReservations.filter((r: any) => r.status === 'confirmed').length;
    const averageOrderValue = confirmedCount > 0 ? confirmedRevenue / confirmedCount : 0;

    return c.json({
      totalRevenue,
      totalReservations: filteredReservations.length,
      averageOrderValue,
      confirmedRevenue,
      pendingRevenue,
      cancelledCount,
      dailySales,
      monthlySales: viewMode === 'year' ? monthlySales : undefined,
      menuSales,
      locationSales,
      staffSales,
    });
  } catch (error) {
    console.log(`Get sales analytics error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

Deno.serve(app.fetch);
