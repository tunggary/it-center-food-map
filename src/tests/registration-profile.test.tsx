// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { RegistrationGuard, RegistrationLink, RegistrationProvider } from '../components/Registration';
import TargetPage from '../routes/Target';
import { ApiError, edge, rpc } from '../lib/api';
import { createProfileSchema } from '../../shared/validation';

vi.mock('../lib/api', async original => ({ ...await original<typeof import('../lib/api')>(), edge: vi.fn(), rpc: vi.fn() }));
vi.mock('../components/Map', () => ({ MapView: () => <div/> }));
beforeAll(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
const teamId = '10000000-0000-4000-8000-000000000001';
const targetId = '11111111-1111-4111-8111-111111111111';
const profile = { id: 'me', nickname: '참여자', teamId, teamName: 'A팀', version: 1 };
const favorite = { id: 'favorite', targetId, participantId: 'me', nickname: '참여자', teamId, teamName: 'A팀', categoryName: '맛집', message: '후기', photos: [], createdAt: '2026-10-14', version: 1 };
function setup({ registered = false, initial = '/', failLookup = false, failSave = false, expired = false }: { registered?: boolean; initial?: string; failLookup?: boolean; failSave?: boolean; expired?: boolean } = {}) {
  let participant = registered ? profile : null;
  if (registered || failLookup || expired) localStorage.setItem('foodmap.identity:v1', 'existing-token');
  const bodies: unknown[] = [];
  vi.mocked(edge).mockImplementation(async (path, options) => {
    if (path === '/session') return {};
    if (path === '/me' && options?.method === 'POST') { bodies.push(options.body); participant = profile; if (failSave && bodies.length === 1) throw new ApiError('NETWORK_ERROR', '응답 유실'); return { resourceId: 'me' }; }
    if (path === '/me') { if (expired) throw new ApiError('IDENTITY_EXPIRED', '참여 정보 만료'); if (failLookup) throw new ApiError('NETWORK_ERROR', '조회 실패'); return participant; }
    if (path.startsWith('/me/favorites')) return { favorites: [favorite], nextCursor: null };
    throw new Error(path);
  });
  vi.mocked(rpc).mockImplementation(async name => {
    if (name === 'read_catalog') return { selectableTeams: [{ id: teamId, name: 'A팀' }], selectableCategories: [], allTeams: [], allCategories: [] };
    if (name === 'read_target') return { target: { id: targetId, name: '장소', kind: 'PLACE' }, favorites: [favorite], totalCount: 1, overallRank: 1, overallRankTied: false, nextCursor: null };
    throw new Error(name);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const router = createMemoryRouter([{ element: <RegistrationProvider><Outlet/></RegistrationProvider>, children: [
    { path: '/', element: <RegistrationLink to="/register?return=team%3Da">최애 등록하기</RegistrationLink> },
    { path: '/register', element: <RegistrationGuard><p>등록 작성</p><label>검증 초안<input/></label></RegistrationGuard> },
    { path: '/targets/:id', element: <TargetPage/> },
  ] }], { initialEntries: [initial] });
  render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);
  return { client, router, bodies };
}
async function save() {
  fireEvent.change(await screen.findByLabelText('닉네임'), { target: { value: '참여자' } });
  fireEvent.change(screen.getByLabelText('팀'), { target: { value: teamId } });
  fireEvent.click(screen.getByRole('button', { name: '저장하고 계속하기' }));
}
it('does not prompt on page entry and cancels without creating a profile or navigating', async () => {
  const app = setup();
  expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  fireEvent.click(screen.getByRole('link', { name: '최애 등록하기' }));
  await screen.findByLabelText('닉네임');
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(app.router.state.location.pathname).toBe('/'); expect(app.bodies).toEqual([]);
  expect(localStorage.getItem('foodmap.identity:v1')).toBeNull();
});
it('saves profile before continuing and retains the original query', async () => {
  const app = setup(); fireEvent.click(screen.getByRole('link', { name: '최애 등록하기' }));
  await save(); await screen.findByText('등록 작성');
  expect(app.router.state.location.search).toBe('?return=team%3Da');
  expect(app.bodies).toHaveLength(1);
  expect(vi.mocked(edge).mock.calls.some(([path]) => path === '/favorites')).toBe(false);
});
it('continues immediately for an existing participant without a modal', async () => {
  setup({ registered: true }); fireEvent.click(screen.getByRole('link', { name: '최애 등록하기' }));
  await screen.findByText('등록 작성'); expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(false);
});
it('guards direct registration URLs and returns to the detail on cancellation', async () => {
  const app = setup({ initial: `/register?target=${targetId}&from=detail&return=team%3Da` });
  fireEvent.click(await screen.findByRole('button', { name: '취소' }));
  await screen.findByRole('heading', { name: '장소' });
  expect(app.router.state.location.pathname + app.router.state.location.search).toBe(`/targets/${targetId}?team=a`);
});
it('reuses the same command after a lost response', async () => {
  const app = setup({ failSave: true }); fireEvent.click(screen.getByRole('link', { name: '최애 등록하기' })); await save();
  await screen.findByText('응답 유실'); fireEvent.click(screen.getByRole('button', { name: '저장 결과 확인' }));
  await screen.findByText('등록 작성'); expect(app.bodies[0]).toEqual(app.bodies[1]);
});
it('does not treat lookup failure as a missing profile', async () => {
  const app = setup({ failLookup: true }); fireEvent.click(screen.getByRole('link', { name: '최애 등록하기' }));
  await screen.findByText('조회 실패'); expect(screen.queryByLabelText('닉네임')).toBeNull(); expect(app.bodies).toEqual([]);
});
it('does not trust cached ownership when the profile lookup fails', async () => {
  const app = setup({ registered: true, failLookup: true, initial: `/targets/${targetId}` });
  app.client.setQueryData(['mine-target', 'existing-token', targetId], favorite);
  await screen.findByText('후기');
  await waitFor(() => expect(app.client.getQueryState(['me', 'existing-token'])?.status).toBe('error'));
  expect(screen.queryByRole('link', { name: '내 등록 관리' })).toBeNull();
  expect(screen.queryByRole('link', { name: '내 등록 수정하기' })).toBeNull();
});
it('hides ownership after browser identity removal', async () => {
  setup({ registered: true, initial: `/targets/${targetId}` });
  await screen.findByRole('link', { name: '내 등록 관리' });
  localStorage.removeItem('foodmap.identity:v1'); fireEvent(window, new StorageEvent('storage', { key: 'foodmap.identity:v1' }));
  await screen.findByRole('link', { name: '나도 최애로 등록' });
  expect(screen.queryByRole('link', { name: '내 등록 수정하기' })).toBeNull();
});
it('checks profile text boundaries by grapheme', () => {
  const input = { requestKey: crypto.randomUUID(), teamId, nickname: '😀'.repeat(20) };
  expect(createProfileSchema.safeParse(input).success).toBe(true);
  expect(createProfileSchema.safeParse({ ...input, nickname: '😀'.repeat(21) }).success).toBe(false);
  expect(createProfileSchema.safeParse({ ...input, nickname: '   ' }).success).toBe(false);
});

it('does not expose direct edit UI to a browser without a profile', async () => {
  const app = setup({ initial: '/register?favorite=unowned' });
  await screen.findByText('본인 참여 정보를 확인한 뒤 내 장소/코스에서 다시 선택해 주세요.');
  expect(screen.queryByText('등록 작성')).toBeNull();
  expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  expect(app.bodies).toEqual([]);
});
it('requires explicit restart after expiry and lets the user cancel', async () => {
  const app = setup({ expired: true });
  fireEvent.click(screen.getByRole('link', { name: '최애 등록하기' }));
  await screen.findByRole('button', { name: '새 참여자로 시작' });
  expect(screen.queryByRole('button', { name: '저장하고 계속하기' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '참여 정보 모달 닫기' }));
  expect(app.router.state.location.pathname).toBe('/');
  expect(localStorage.getItem('foodmap.identity:v1')).toBe('existing-token');
});
it('keeps a single modal for repeated registration clicks', async () => {
  setup();
  fireEvent.doubleClick(screen.getByRole('link', { name: '최애 등록하기' }));
  fireEvent.click(screen.getByRole('link', { name: '최애 등록하기' }));
  await screen.findByRole('button', { name: '취소' });
  expect(document.querySelectorAll('dialog[open]')).toHaveLength(1);
});

it('retains the mounted draft while failed profile reads hide the protected form', async () => {
  const app = setup({ registered: true, initial: '/register' });
  const draft = await screen.findByLabelText('검증 초안');
  fireEvent.change(draft, { target: { value: '실패 후 유지할 초안' } });
  const original = vi.mocked(edge).getMockImplementation()!;
  vi.mocked(edge).mockImplementation(async (path, options) => { if (path === '/me') throw new ApiError('NETWORK_ERROR', '일시 조회 실패'); return original(path, options); });
  await app.client.invalidateQueries({ queryKey: ['me', 'existing-token'] });
  await screen.findByText('일시 조회 실패');
  expect(screen.queryByRole('textbox', { name: '검증 초안' })).toBeNull();
  vi.mocked(edge).mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  const restored = await screen.findByRole('textbox', { name: '검증 초안' });
  expect((restored as HTMLInputElement).value).toBe('실패 후 유지할 초안');
});
