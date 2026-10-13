import { edge, ApiError } from './api';
const KEY = 'foodmap.identity:v1';
let pending: Promise<string> | undefined;
export function storedToken(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
export function newToken(): string { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export async function prepareIdentity(): Promise<string> {
  if (pending) return pending;
  pending = (async () => {
    const prepare = async () => {
      let token: string;
      try { token = localStorage.getItem(KEY) || newToken(); localStorage.setItem(KEY, token); }
      catch { throw new ApiError('IDENTITY_REQUIRED', '브라우저 저장소를 사용할 수 없어 등록을 이어갈 수 없어요. 저장소 사용을 허용해 주세요.'); }
      await edge('/session', { method: 'POST', token });
      return token;
    };
    return navigator.locks ? navigator.locks.request('foodmap.identity', prepare) : prepare();
  })().finally(() => { pending = undefined; });
  return pending;
}
export function resetIdentity() { localStorage.removeItem(KEY); }
