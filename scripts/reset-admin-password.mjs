/**
 * admin のパスワードを bcryptjs で再生成し DB を更新（Edge Function と互換性を確保）
 * 実行: npm run reset-admin-password
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const candidates = [join(process.cwd(), '.env.local'), resolve(projectRoot, '.env.local')];
  const envPath = candidates.find((p) => existsSync(p));
  if (envPath) config({ path: envPath });
}

const supabaseUrl = process.env.SUPABASE_URL || (process.env.VITE_SUPABASE_PROJECT_ID ? `https://${process.env.VITE_SUPABASE_PROJECT_ID}.supabase.co` : null);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('VITE_SUPABASE_PROJECT_ID と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const INITIAL_PASSWORD = 'InitialPassword1!';

async function main() {
  const { data: user, error: fetchError } = await supabase.from('app_users').select('user_id, login_id').eq('login_id', 'admin').maybeSingle();
  if (fetchError) {
    console.error('admin の取得に失敗:', fetchError.message);
    process.exit(1);
  }
  if (!user) {
    console.error('admin ユーザーが見つかりません');
    process.exit(1);
  }

  const hash = await bcrypt.hash(INITIAL_PASSWORD, 10);
  const { error: updateError } = await supabase
    .from('app_users')
    .update({ password_hash: hash, must_change_password: true, updated_at: new Date().toISOString() })
    .eq('user_id', user.user_id);

  if (updateError) {
    console.error('パスワード更新に失敗:', updateError.message);
    process.exit(1);
  }

  console.log('admin のパスワードを更新しました。');
  console.log('ログインID: admin');
  console.log('パスワード: ' + INITIAL_PASSWORD);
}

main();
