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

if (!projectId || !publicAnonKey) {
  // Vercel / ローカルともに環境変数が未設定の場合に分かりやすくするための警告
  console.warn(
    '[Supabase] VITE_SUPABASE_PROJECT_ID または VITE_SUPABASE_ANON_KEY が設定されていません。'
  );
}