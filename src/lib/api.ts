import type { ErrorCode } from '../../shared/contracts';
export const config = {
  url: (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, ''),
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
  kakaoKey: import.meta.env.VITE_KAKAO_JS_KEY ?? '',
};
export class ApiError extends Error {
  constructor(public code: ErrorCode | 'CONFIG_REQUIRED' | 'NETWORK_ERROR', message: string, public details?: unknown, public retryAfterSeconds?: number) { super(message); }
}
const messages: Partial<Record<ErrorCode, string>> = {
  IDENTITY_EXPIRED: '참여 정보가 만료됐어요. 새 참여자로 시작하면 이전 등록의 수정 권한은 이어지지 않아요.',
  ADMIN_SESSION_EXPIRED: '운영자 로그인이 만료됐어요. 다시 로그인한 뒤 직접 재시도해 주세요.',
  FORBIDDEN: '이 작업을 할 권한이 없어요.', TARGET_GONE: '이 장소나 코스가 삭제됐어요. 다른 대상을 선택해 주세요.',
  ALREADY_REGISTERED: '이미 등록한 최애예요. 내 최애에서 수정할 수 있어요.',
  VERSION_CONFLICT: '다른 변경이 먼저 저장됐어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.',
  SNAPSHOT_CHANGED: '목록이 갱신됐어요. 첫 페이지부터 다시 확인해 주세요.',
  RESULT_GONE: '이 요청으로 등록했던 내용이 삭제됐어요. 새로 등록하려면 새 작성을 시작해 주세요.',
  RATE_LIMITED: '요청이 잠시 많아요. 안내된 시간 뒤 다시 시도해 주세요.',
  CAPACITY_REACHED: '사진 저장 공간이 부족해요. 사진을 제거하고 다시 제출할 수 있어요.',
  DEPENDENCY_UNAVAILABLE: '연결이 잠시 어려워요. 입력을 유지했으니 다시 시도해 주세요.',
};
async function decode<T>(response: Response, envelope: boolean): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error ?? body;
    const code = (error?.code === 'P0001' ? error?.message : error?.code) as ErrorCode;
    throw new ApiError(code in messages || code ? code : 'INTERNAL_ERROR', messages[code] ?? (body?.error?.message || '요청을 처리하지 못했어요. 입력을 유지했으니 다시 시도해 주세요.'), error?.details, error?.retryAfterSeconds ?? (Number(response.headers.get('Retry-After')) || undefined));
  }
  return (envelope ? body.data : body) as T;
}
function requireConfig() { if (!config.url || !config.key) throw new ApiError('CONFIG_REQUIRED', '서비스 연결을 준비하고 있어요. 잠시 후 다시 접속해 주세요.'); }
export async function rpc<T>(name: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  requireConfig();
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store', signal });
  return decode<T>(response, false);
}
export async function edge<T>(path: string, options: { method?: string; body?: unknown; token?: string; admin?: string; signal?: AbortSignal } = {}): Promise<T> {
  requireConfig();
  const headers: Record<string, string> = { apikey: config.key, 'Content-Type': 'application/json' };
  if (options.token) headers['X-Participant-Token'] = options.token;
  if (options.admin) headers.Authorization = `Bearer ${options.admin}`;
  const functionPath = path === '/media-finalize' ? '/media-finalize' : `/api${path}`;
  const response = await fetch(`${config.url}/functions/v1${functionPath}`, { method: options.method ?? 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal, cache: 'no-store' });
  return decode<T>(response, true);
}
export function errorMessage(error: unknown): string {
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return '연결이 잠시 어려워요. 입력을 유지했으니 다시 시도해 주세요.';
  if (error instanceof Error && error.name === 'ZodError') {
    const issues = (error as Error & { issues?: { message?: unknown }[] }).issues;
    const message = issues?.[0]?.message;
    return typeof message === 'string' && /[가-힣]/.test(message) ? message : '입력값을 확인해 주세요.';
  }
  return error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
}
export const photoUrl = (id: string, size: 'thumb' | 'full' = 'thumb') => `${config.url}/functions/v1/api/photos/${encodeURIComponent(id)}?size=${size}`;
