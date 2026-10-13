import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-test-key'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('public reads use POST JSON without participant identity', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ revision: '1', dataEpoch: 'test' })));
  vi.stubGlobal('fetch', fetch); const { rpc } = await import('../lib/api'); await rpc('read_revision');
  const [, options] = fetch.mock.calls[0]; expect(options.method).toBe('POST'); expect(options.body).toBe('{}'); expect(options.cache).toBe('no-store'); expect(options.headers['X-Participant-Token']).toBeUndefined(); expect(options.headers.Authorization).toBeUndefined();
});
it('participant and administrator credentials are kept on separate calls', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ requestId: 'r', data: { resourceId: 'id' } }))));
  vi.stubGlobal('fetch', fetch); const { edge } = await import('../lib/api');
  await edge('/favorites', { method: 'POST', token: 'participant', body: { requestKey: 'stable' } });
  await edge('/admin/catalog', { admin: 'jwt' });
  expect(fetch.mock.calls[0][1].headers['X-Participant-Token']).toBe('participant'); expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer jwt'); expect(fetch.mock.calls[1][1].headers['X-Participant-Token']).toBeUndefined();
});
it('commands are not automatically retried after lost responses', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('network')); vi.stubGlobal('fetch', fetch);
  const { edge } = await import('../lib/api'); await expect(edge('/favorites', { method: 'POST', token: 'p', body: { requestKey: 'same' } })).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(1);
});
it('business errors are normalized without exposing SQL details', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'P0001', message: 'TARGET_GONE', details: 'internal table data' }), { status: 400 })));
  const { rpc } = await import('../lib/api'); await expect(rpc('read_target')).rejects.toMatchObject({ code: 'TARGET_GONE' });
});
