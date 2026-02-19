/**
 * ログイン失敗の原因を診断するスクリプト
 * 実行: node --env-file=.env.local scripts/diagnose-login.mjs
 * または: npm run diagnose-login
 * 前提: .env.local に VITE_SUPABASE_PROJECT_ID と SUPABASE_SERVICE_ROLE_KEY を設定
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// dotenv で .env.local を読み込み（--env-file 未使用時のフォールバック）
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const candidates = [
    join(process.cwd(), '.env.local'),
    resolve(projectRoot, '.env.local'),
  ];
  const envPath = candidates.find((p) => existsSync(p));
  if (envPath) {
    config({ path: envPath });
  }
}

const projectId = process.env.VITE_SUPABASE_PROJECT_ID;
const supabaseUrl = process.env.SUPABASE_URL || (projectId ? `https://${projectId}.supabase.co` : null);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('VITE_SUPABASE_PROJECT_ID と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const INITIAL_PASSWORD = 'InitialPassword1!';

// ローカル分析ツール (127.0.0.1:7242) は未使用のため送信しない（接続タイムアウトによる遅延を防ぐ）
async function sendLog(_data) {
  // no-op
}

async function main() {
  const result = { login_id: 'admin', user_exists: false, has_password_hash: false, hash_prefix: null, bcrypt_match: null, error: null };

  try {
    const { data: user, error } = await supabase
      .from('app_users')
      .select('user_id, login_id, email, password_hash, active_flag')
      .eq('login_id', 'admin')
      .maybeSingle();

    if (error) {
      result.error = error.message;
      await sendLog(result);
      console.log('Diagnostic result:', JSON.stringify(result, null, 2));
      return;
    }

    if (!user) {
      result.user_exists = false;
      await sendLog(result);
      console.log('Diagnostic result:', JSON.stringify(result, null, 2));
      return;
    }

    result.user_exists = true;
    result.has_password_hash = !!user.password_hash;
    result.hash_prefix = user.password_hash ? user.password_hash.substring(0, 10) : null;
    result.active_flag = user.active_flag;

    if (user.password_hash) {
      try {
        const bcrypt = await import('bcryptjs');
        const ok = await bcrypt.compare(INITIAL_PASSWORD, user.password_hash);
        result.bcrypt_match = ok;
      } catch (e) {
        result.bcrypt_match = 'error:' + (e?.message || String(e));
      }
    }

    await sendLog(result);
    console.log('Diagnostic result:', JSON.stringify(result, null, 2));
  } catch (err) {
    result.error = err?.message || String(err);
    await sendLog(result);
    console.log('Diagnostic result:', JSON.stringify(result, null, 2));
  }
}

main();
