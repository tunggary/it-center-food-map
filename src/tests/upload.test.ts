import { afterEach, expect, it, vi } from 'vitest';
import { uploadRawPhoto } from '../features/media/upload';
afterEach(() => vi.unstubAllGlobals());
it('advances an already uploaded immutable photo to finalize on precise Storage duplicate errors', async () => {
  for (const status of [400, 409]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Duplicate', statusCode: '409', message: 'The resource already exists' }), { status })));
    await expect(uploadRawPhoto('https://storage.test/signed', new Blob(['jpeg']))).resolves.toBeUndefined();
  }
});
it('does not treat arbitrary 400 or 409 upload failures as successful uploads', async () => {
  for (const [status, body] of [[400, { error: 'InvalidRequest', statusCode: '400' }], [409, { error: 'Conflict', statusCode: '409' }], [400, { error: 'Duplicate', statusCode: '400' }], [403, { error: 'Duplicate', statusCode: '409' }]] as const) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
    await expect(uploadRawPhoto('https://storage.test/signed', new Blob(['jpeg']))).rejects.toThrow('사진 업로드에 실패');
  }
});
