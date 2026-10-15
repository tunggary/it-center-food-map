// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import TargetPage from '../routes/Target';
import RegisterEntry from '../routes/RegisterEntry';
import { ApiError, edge, rpc } from '../lib/api';

vi.mock('../lib/identity', async original => ({ ...await original<typeof import('../lib/identity')>(), prepareIdentity: async () => 'participant', storedToken: () => 'participant', resetIdentity: vi.fn() }));
vi.mock('../components/Map', () => ({ MapView: () => <div/> }));
vi.mock('../features/media/PhotoPicker', () => ({ PhotoPicker: () => <div/> }));
vi.mock('../lib/api', async original => ({ ...await original<typeof import('../lib/api')>(), edge: vi.fn(), rpc: vi.fn() }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const targetId = '11111111-1111-4111-8111-111111111111';
const favoriteId = '22222222-2222-4222-8222-222222222222';
const detailUrl = `/targets/${targetId}?team=test&category=food`;
function setup({ kind = 'PLACE', own = false, initial = detailUrl, deleteFails = false }: { kind?: 'PLACE' | 'COURSE'; own?: boolean; initial?: string; deleteFails?: boolean } = {}) {
  let deleted = false;
  const target = { id: targetId, name: '복귀할 대상', kind, lng: 127, lat: 37, points: kind === 'COURSE' ? [[127, 37], [127.1, 37.1]] : undefined };
  const favorite = { id: favoriteId, targetId, target, participantId: 'me', nickname: '나', teamId: 'test', teamName: '팀', categoryId: 'food', categoryName: '분류', message: '기존 후기', photos: [], version: 1, createdAt: '2026-10-14' };
  vi.mocked(rpc).mockImplementation(async name => {
    if (name === 'read_catalog') return { selectableTeams: [], allTeams: [], selectableCategories: [], allCategories: [], revision: '1', dataEpoch: 'epoch' };
    if (name === 'read_target') return { target, favorites: own && !deleted ? [favorite] : [], totalCount: own && !deleted ? 1 : 0, overallRank: own && !deleted ? 1 : null, overallRankTied: false, filteredCount: own && !deleted ? 1 : 0, nextCursor: null, revision: deleted ? '2' : '1', dataEpoch: 'epoch' };
    throw new Error(`Unexpected RPC: ${name}`);
  });
  vi.mocked(edge).mockImplementation(async (path, options) => {
    if (path === '/me') return { id: 'me', nickname: '나', teamId: 'test', teamName: '팀' };
    if (path.startsWith('/me/favorites')) return { favorites: own && !deleted ? [favorite] : [], nextCursor: null };
    if (path === `/favorites/${favoriteId}` && options?.method === 'DELETE') {
      if (deleteFails) throw new ApiError('NETWORK_ERROR', '삭제 실패');
      deleted = true;
      return { resourceId: favoriteId, targetId, revision: '2', replayed: false };
    }
    throw new Error(`Unexpected path: ${path}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const router = createMemoryRouter([
    { path: '/targets/:id', element: <TargetPage/> },
    { path: '/register', element: <RegisterEntry/> },
    { path: '/me/favorites', element: <p>내 목록</p> },
    { path: '/', element: <p>메인</p> },
  ], { initialEntries: [initial] });
  render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);
  return { router, client };
}

it.each(['PLACE', 'COURSE'] as const)('%s detail returns from add, edit and delete with filters preserved', async kind => {
  const { router, client } = setup({ kind });
  fireEvent.click(await screen.findByRole('link', { name: '나도 최애로 등록' }));
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('from')).toBe('detail');
  expect(params.get('target')).toBe(targetId);
  await screen.findByRole('heading', { name: '이곳을 최애로 등록' });
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await screen.findByRole('heading', { name: '복귀할 대상' });
  expect(router.state.location.pathname + router.state.location.search).toBe(detailUrl);
  expect(router.state.historyAction).toBe('REPLACE');
  router.dispose(); client.clear();

  cleanup();
  const edited = setup({ kind, own: true });
  fireEvent.click(await screen.findByRole('link', { name: '내 등록 수정하기' }));
  await screen.findByRole('heading', { name: '내 최애 수정' });
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await screen.findByRole('heading', { name: '복귀할 대상' });
  expect(edited.router.state.location.pathname + edited.router.state.location.search).toBe(detailUrl);
  fireEvent.click(await screen.findByRole('link', { name: '내 등록 관리' }));
  await screen.findByRole('heading', { name: '내 최애 수정' });
  fireEvent.click(screen.getByRole('button', { name: '내 등록 삭제' }));
  fireEvent.click(screen.getByRole('button', { name: '삭제' }));
  await screen.findByText('등록된 최애가 아직 없어요.');
  expect(await screen.findByRole('link', { name: '나도 최애로 등록' })).toBeTruthy();
  expect(screen.queryByText('기존 후기')).toBeNull();
  expect(edited.router.state.location.pathname + edited.router.state.location.search).toBe(detailUrl);
  expect(edited.router.state.historyAction).toBe('REPLACE');
  edited.router.dispose(); edited.client.clear();
});

it.each([false, true])('returns to detail after a refreshed registration URL (edit=%s)', async own => {
  const { router, client } = setup({ own, initial: `/register?target=${targetId}&from=detail&return=team%3Dtest%26category%3Dfood${own ? `&favorite=${favoriteId}` : ''}` });
  await screen.findByRole('heading', { name: own ? '내 최애 수정' : '이곳을 최애로 등록' });
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await screen.findByRole('heading', { name: '복귀할 대상' });
  expect(router.state.location.pathname + router.state.location.search).toBe(detailUrl);
  router.dispose(); client.clear();
});

it('keeps edits when closing is cancelled and returns to detail when discard is confirmed', async () => {
  const { router, client } = setup({ own: true });
  fireEvent.click(await screen.findByRole('link', { name: '내 등록 수정하기' }));
  const input = await screen.findByLabelText(/최애를 소개하는 한마디/);
  fireEvent.change(input, { target: { value: '변경 중인 후기' } });
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect((input as HTMLTextAreaElement).value).toBe('변경 중인 후기');
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  fireEvent.click(screen.getByRole('button', { name: '초안 버리기' }));
  await screen.findByRole('heading', { name: '복귀할 대상' });
  expect(router.state.location.pathname + router.state.location.search).toBe(detailUrl);
  router.dispose(); client.clear();
});

it('keeps the edit screen and text after deletion fails', async () => {
  const { router, client } = setup({ own: true, deleteFails: true });
  fireEvent.click(await screen.findByRole('link', { name: '내 등록 관리' }));
  const input = await screen.findByLabelText(/최애를 소개하는 한마디/);
  fireEvent.change(input, { target: { value: '남겨둘 후기' } });
  fireEvent.click(screen.getByRole('button', { name: '내 등록 삭제' }));
  fireEvent.click(screen.getByRole('button', { name: '삭제' }));
  await screen.findByText('삭제 실패');
  expect(router.state.location.pathname).toBe('/register');
  expect((input as HTMLTextAreaElement).value).toBe('남겨둘 후기');
  router.dispose(); client.clear();
});

it.each(['close', 'delete'])('keeps the personal-list return when edit starts outside detail (%s)', async action => {
  const { router, client } = setup({ own: true, initial: `/register?favorite=${favoriteId}` });
  await screen.findByRole('heading', { name: '내 최애 수정' });
  if (action === 'close') fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  else {
    fireEvent.click(screen.getByRole('button', { name: '내 등록 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
  }
  await screen.findByText('내 목록');
  expect(router.state.location.pathname).toBe('/me/favorites');
  router.dispose(); client.clear();
});

it('preserves ranking tab, saved custom filters and page through registration and refresh', async () => {
  const query = 'rankingTab=cafe&team=test&category=food&rankPage=2';
  const { router, client } = setup({ initial: `/targets/${targetId}?${query}` });
  fireEvent.click(await screen.findByRole('link', { name: '나도 최애로 등록' }));
  expect(new URLSearchParams(router.state.location.search).get('return')).toBe(query);
  await screen.findByRole('heading', { name: '이곳을 최애로 등록' });
  const registrationUrl = router.state.location.pathname + router.state.location.search;
  router.dispose(); client.clear(); cleanup();
  const refreshed = setup({ initial: registrationUrl });
  await screen.findByRole('heading', { name: '이곳을 최애로 등록' });
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await screen.findByRole('heading', { name: '복귀할 대상' });
  expect(refreshed.router.state.location.pathname + refreshed.router.state.location.search).toBe(`/targets/${targetId}?${query}`);
  expect(screen.getByRole('link', { name: '전체 랭킹 보기' }).getAttribute('href')).toBe(`/rankings?${query}`);
  refreshed.router.dispose(); refreshed.client.clear();
});
