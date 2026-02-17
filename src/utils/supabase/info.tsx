/* Supabase project configuration
 *
 * NOTE:
 * 本番公開や GitHub への公開を想定し、
 * プロジェクトIDと anon key はコードに直書きせず
 * Vite の環境変数から読み込むようにしています。
 *
 * 必要な環境変数:
 * - VITE_SUPABASE_PROJECT_ID
 * - VITE_SUPABASE_ANON_KEY
 */

export const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
export const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ローカルデバッグ用: VITE_SUPABASE_URL=http://127.0.0.1:54321 で Edge Function をローカルに接続
const supabaseBaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || (projectId ? `https://${projectId}.supabase.co` : '');
export const functionsBaseUrl = `${supabaseBaseUrl}/functions/v1/make-server-fe84bde0`;

if (!projectId || !publicAnonKey) {
  // Vercel / ローカルともに環境変数が未設定の場合に分かりやすくするための警告
  console.warn(
    '[Supabase] VITE_SUPABASE_PROJECT_ID または VITE_SUPABASE_ANON_KEY が設定されていません。'
  );
}