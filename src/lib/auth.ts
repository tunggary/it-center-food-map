import { config } from './api';
let client: ReturnType<typeof import('@supabase/supabase-js')['createClient']> | undefined;
export async function adminClient() {
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(config.url, config.key, { auth: { storage: sessionStorage, storageKey: 'foodmap.admin:v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  }
  return client;
}
export async function adminToken(): Promise<string> {
  const { data } = await (await adminClient()).auth.getSession();
  if (!data.session) throw new Error('운영자 로그인이 필요해요. 다시 로그인한 뒤 직접 재시도해 주세요.');
  return data.session.access_token;
}
