// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { installRankingObserver, intersectRankingEnd } from './ranking-observer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import ExplorePage, { RankingsPanel } from '../routes/Explore';
import TargetPage from '../routes/Target';
import { ApiError, edge, rpc } from '../lib/api';
import { storedToken } from '../lib/identity';
vi.mock('../components/Map', () => ({ MapView: ({ pins }: { pins?: { targetId: string }[] }) => <div data-testid="map">{pins?.map(p => p.targetId).join(',')}</div> }));
vi.mock('../lib/identity', async original => ({ ...await original<typeof import('../lib/identity')>(), storedToken: vi.fn(() => null) }));
vi.mock('../lib/api', async original => ({ ...await original<typeof import('../lib/api')>(), rpc: vi.fn(), edge: vi.fn() }));
const catalog = { allTeams: [{ id: 'a', name: 'A팀' }, { id: 'b', name: 'B팀' }], allCategories: [{ id: 'food', name: '맛집' }, { id: 'cafe', name: '카페' }, { id: 'walk', name: '산책' }, { id: 'extra', name: '기타' }], selectableTeams: [], selectableCategories: [], revision: '1', dataEpoch: 'e' };
function setup(url = '/rankings') {
  vi.mocked(rpc).mockImplementation(async (name, body) => {
    if (name === 'read_catalog') return catalog;
    if (name === 'read_explore') {
      const id = `${body?.p_team_id ?? 'all'}-${body?.p_category_id ?? 'all'}-${body?.p_rank_page}`;
      const empty = body?.p_team_id === 'b' && body?.p_category_id === 'food';
      return { pins: empty ? [] : [{ targetId: id }], rankingPage: empty ? [] : [{ targetId: id, name: id, kind: 'PLACE', count: 3, rank: 1 }], hasMore: body?.p_rank_page === 1, revision: '1', dataEpoch: 'e' };
    }
    if (name === 'read_target') return { target: { id: body?.p_target_id, name: '상세 장소', kind: 'PLACE', lng: 127, lat: 37 }, favorites: [], totalCount: 3, overallRank: 3, overallRankTied: false, revision: '1', dataEpoch: 'e' };
    throw new Error(name);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const router = createMemoryRouter([{ element: <ExplorePage/>, children: [{ path: '/', element: null }, { path: '/rankings', element: <RankingsPanel/> }, { path: '/targets/:id', element: <TargetPage/> }] }], { initialEntries: [url] });
  render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);
  return { router, client, dispose: () => { router.dispose(); client.clear(); } };
}
beforeEach(installRankingObserver);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.mocked(storedToken).mockReturnValue(null); });
it('shares tab filters and page results with the map, ignoring saved custom filters on fixed tabs', async () => {
  const app = setup('/rankings?rankingTab=all&team=a&category=cafe');
  await screen.findByRole('link', { name: /all-all-1/ });
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByRole('navigation', { name: '랭킹 페이지 이동' })).toBeNull();
  for (const [label, id] of [['맛집', 'food'], ['카페', 'cafe'], ['산책코스', 'walk']]) {
    fireEvent.click(screen.getByRole('tab', { name: label }));
    await screen.findByRole('link', { name: new RegExp(`all-${id}-1`) });
    expect(screen.getByTestId('map').textContent).toBe(`all-${id}-1`);
  }
  await intersectRankingEnd();
  await screen.findByRole('link', { name: /all-walk-2/ });
  expect(screen.getByTestId('map').textContent).toBe('all-walk-2');
  expect(screen.getByRole('link', { name: /all-walk-1/ })).toBeTruthy();
  expect(document.querySelector('.ranking-sentinel')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '커스텀' }));
  await screen.findByRole('link', { name: /a-cafe-1/ });
  expect(app.router.state.location.search).not.toContain('rankPage');
  app.dispose();
});
it('defaults anonymous custom to all teams and categories, retaining selections across tabs', async () => {
  const app = setup('/rankings?category=food');
  await screen.findByRole('link', { name: /all-food-1/ });
  fireEvent.click(screen.getByRole('tab', { name: '커스텀' }));
  await screen.findByRole('combobox', { name: '팀 필터' });
  await screen.findByRole('link', { name: /all-all-1/ });
  fireEvent.change(screen.getByRole('combobox', { name: '팀 필터' }), { target: { value: 'a' } });
  fireEvent.change(screen.getByRole('combobox', { name: '카테고리 필터' }), { target: { value: 'cafe' } });
  await screen.findByRole('link', { name: /a-cafe-1/ });
  fireEvent.click(screen.getByRole('tab', { name: '전체' }));
  await screen.findByRole('link', { name: /all-all-1/ });
  fireEvent.click(screen.getByRole('tab', { name: '커스텀' }));
  await screen.findByRole('link', { name: /a-cafe-1/ });
  app.dispose();
});
it('waits for my team before querying custom and never overwrites explicit all teams', async () => {
  vi.mocked(storedToken).mockReturnValue('test-token');
  let resolveMe!: (value: unknown) => void;
  vi.mocked(edge).mockReturnValue(new Promise(resolve => { resolveMe = resolve; }));
  const app = setup('/rankings?rankingTab=custom');
  await screen.findByRole('combobox', { name: '팀 필터' });
  expect(vi.mocked(rpc).mock.calls.some(([name]) => name === 'read_explore')).toBe(false);
  await act(async () => resolveMe({ id: 'me', teamId: 'a' }));
  await screen.findByRole('link', { name: /a-all-1/ });
  fireEvent.change(screen.getByRole('combobox', { name: '팀 필터' }), { target: { value: '' } });
  await screen.findByRole('link', { name: /all-all-1/ });
  expect(new URLSearchParams(app.router.state.location.search).get('team')).toBe('');
  app.dispose();
});
it('preserves an explicit selection even while my team request is pending', async () => {
  vi.mocked(storedToken).mockReturnValue('test-token');
  let resolveMe!: (value: unknown) => void;
  vi.mocked(edge).mockReturnValue(new Promise(resolve => { resolveMe = resolve; }));
  const app = setup('/rankings?rankingTab=custom');
  fireEvent.change(await screen.findByRole('combobox', { name: '팀 필터' }), { target: { value: 'b' } });
  await screen.findByRole('link', { name: /b-all-1/ });
  await act(async () => resolveMe({ id: 'me', teamId: 'a' }));
  expect(screen.getByRole('combobox', { name: '팀 필터' })).toHaveProperty('value', 'b');
  app.dispose();
});
it('shows empty custom results and removes old map pins', async () => {
  const app = setup('/rankings?team=a&category=cafe');
  await screen.findByRole('link', { name: /a-cafe-1/ });
  fireEvent.change(screen.getByRole('combobox', { name: '팀 필터' }), { target: { value: 'b' } });
  fireEvent.change(screen.getByRole('combobox', { name: '카테고리 필터' }), { target: { value: 'food' } });
  await screen.findByText('이 조건의 최애가 아직 없어요.');
  expect(screen.getByTestId('map').textContent).toBe('');
  expect(screen.queryByRole('link', { name: /a-cafe/ })).toBeNull();
  app.dispose();
});
it('restores ranking tab and cached rows through detail, normalizing legacy page URLs', async () => {
  const app = setup('/rankings?rankingTab=cafe&team=b&category=food&rankPage=2');
  await screen.findByRole('link', { name: /all-cafe-1/ });
  expect(app.router.state.location.search).not.toContain('rankPage');
  await intersectRankingEnd();
  fireEvent.click(await screen.findByRole('link', { name: /all-cafe-2/ }));
  await screen.findByRole('heading', { name: '상세 장소' });
  fireEvent.click(screen.getByRole('link', { name: '전체 랭킹 보기' }));
  await screen.findByRole('link', { name: /all-cafe-2/ });
  await act(async () => { await app.router.navigate(app.router.state.location.pathname + app.router.state.location.search, { replace: true }); });
  expect(screen.getByRole('tab', { name: '카페' }).getAttribute('aria-selected')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await waitFor(() => expect(app.router.state.location.pathname).toBe('/'));
  expect(new URLSearchParams(app.router.state.location.search).get('category')).toBe('cafe');
  expect(new URLSearchParams(app.router.state.location.search).get('team')).toBe('');
  expect(app.router.state.location.search).not.toMatch(/rankingTab|rankPage/);
  app.dispose();
});
it('does not query all rankings when a fixed category is missing', async () => {
  const app = setup('/rankings?rankingTab=walk');
  await screen.findByRole('link', { name: /all-walk-1/ });
  await act(async () => { app.client.setQueryData(['catalog'], { ...catalog, allCategories: [] }); });
  await screen.findByText('이 카테고리를 찾을 수 없어요.');
  expect(screen.getByTestId('map').textContent).toBe('');
  expect(screen.queryByRole('link', { name: /all-walk/ })).toBeNull();
  app.dispose();
});
it('supports keyboard tabs and browser back without leaking the other tab results', async () => {
  const app = setup();
  await screen.findByRole('link', { name: /all-all-1/ });
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '우리의 최애 랭킹' })));
  fireEvent.keyDown(screen.getByRole('tab', { name: '전체' }), { key: 'ArrowRight' });
  await screen.findByRole('link', { name: /all-food-1/ });
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: '맛집' }));
  await act(async () => { await app.router.navigate(-1); });
  await screen.findByRole('link', { name: /all-all-1/ });
  app.dispose();
});

it('falls back to all teams for an expired identity without blocking public rankings', async () => {
  vi.mocked(storedToken).mockReturnValue('expired-token');
  vi.mocked(edge).mockRejectedValue(new ApiError('IDENTITY_EXPIRED', '만료'));
  const app = setup('/rankings?rankingTab=custom');
  await screen.findByRole('link', { name: /all-all-1/ });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(new URLSearchParams(app.router.state.location.search).get('team')).toBe('');
  app.dispose();
});

it('ignores a late response from the previous tab', async () => {
  const app = setup();
  await screen.findByRole('link', { name: /all-all-1/ });
  const original = vi.mocked(rpc).getMockImplementation()!;
  let resolveFood!: (value: unknown) => void;
  vi.mocked(rpc).mockImplementation((name, body, signal) => name === 'read_explore' && body?.p_category_id === 'food' ? new Promise(resolve => { resolveFood = resolve; }) : original(name, body, signal));
  fireEvent.click(screen.getByRole('tab', { name: '맛집' }));
  await waitFor(() => expect(resolveFood).toBeTypeOf('function'));
  fireEvent.click(screen.getByRole('tab', { name: '카페' }));
  await screen.findByRole('link', { name: /all-cafe-1/ });
  await act(async () => resolveFood({ pins: [{ targetId: 'late-food' }], rankingPage: [{ targetId: 'late-food', name: '늦은 맛집', kind: 'PLACE', count: 99, rank: 1 }], hasMore: false }));
  expect(screen.queryByText('늦은 맛집')).toBeNull();
  expect(screen.getByTestId('map').textContent).toBe('all-cafe-1');
  app.dispose();
});
it('shows API errors instead of claiming that the tab is empty', async () => {
  const app = setup();
  await screen.findByRole('link', { name: /all-all-1/ });
  const original = vi.mocked(rpc).getMockImplementation()!;
  vi.mocked(rpc).mockImplementation((name, body, signal) => name === 'read_explore' && body?.p_category_id === 'walk' ? Promise.reject(new ApiError('DEPENDENCY_UNAVAILABLE', '조회 실패')) : original(name, body, signal));
  fireEvent.click(screen.getByRole('tab', { name: '산책코스' }));
  await screen.findByText('조회 실패');
  expect(screen.queryByText('이 조건의 최애가 아직 없어요.')).toBeNull();
  expect(screen.getByTestId('map').textContent).toBe('');
  app.dispose();
});

it('uses gold, silver and coral trophies by server rank and detects ties outside the current page', async () => {
  const app = setup();
  await screen.findByRole('link', { name: /all-all-1/ });
  const rows = [1, 2, 3, 4].map(rank => ({ targetId: `medal-${rank}`, name: `순위 ${rank}`, kind: 'PLACE', rank, count: 10 - rank }));
  const pins = rows.map(r => ({ targetId: r.targetId, count: r.count }));
  await act(async () => { app.client.setQueryData(['ranking', 'all', null, null], { pages: [{ pins, rankingPage: rows, hasMore: false }], pageParams: [1] }); });
  expect((await screen.findByRole('link', { name: /1위 · 금색 트로피/ })).querySelector('.trophy-1')?.getAttribute('style')).toContain('trophies.webp');
  expect(screen.getByRole('link', { name: /2위 · 은색 트로피/ }).querySelector('.trophy-2')).toBeTruthy();
  expect(screen.getByRole('link', { name: /3위 · 코랄 트로피/ }).querySelector('.trophy-3')).toBeTruthy();
  expect(screen.getByRole('link', { name: /4위/ }).querySelector('.rank-trophy')).toBeNull();
  expect(document.querySelectorAll('.rank-tie')).toHaveLength(0);
  await act(async () => { app.client.setQueryData(['ranking', 'all', null, null], { pages: [{ pins: [...pins, { targetId: 'other-page', count: rows[1].count }], rankingPage: [rows[1]], hasMore: false }], pageParams: [1] }); });
  expect(await screen.findByRole('link', { name: /공동 2위 · 은색 트로피/ })).toBeTruthy();
  expect(document.querySelectorAll('.rank-tie')).toHaveLength(1);
  app.dispose();
});

it('keeps loaded rows, coalesces repeated intersections and stops after the last page', async () => {
  const app = setup();
  await screen.findByRole('link', { name: /all-all-1/ });
  const original = vi.mocked(rpc).getMockImplementation()!;
  let resolvePage!: (value: unknown) => void;
  vi.mocked(rpc).mockImplementation((name, body, signal) => name === 'read_explore' && body?.p_rank_page === 2 ? new Promise(resolve => { resolvePage = resolve; }) : original(name, body, signal));
  await intersectRankingEnd();
  await waitFor(() => expect(resolvePage).toBeTypeOf('function'));
  await intersectRankingEnd();
  expect(vi.mocked(rpc).mock.calls.filter(([name, body]) => name === 'read_explore' && body?.p_rank_page === 2)).toHaveLength(1);
  expect(screen.getByRole('link', { name: /all-all-1/ })).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('랭킹을 더 불러오고 있어요');
  await act(async () => resolvePage({ pins: [], rankingPage: [
    { targetId: 'all-all-1', name: 'all-all-1', kind: 'PLACE', count: 3, rank: 1 },
    { targetId: 'last', name: '마지막 장소', kind: 'PLACE', count: 1, rank: 2 },
  ], hasMore: false }));
  await screen.findByRole('link', { name: /마지막 장소/ });
  expect(screen.getAllByRole('link', { name: /all-all-1/ })).toHaveLength(1);
  expect(document.querySelector('.ranking-sentinel')).toBeNull();
  await intersectRankingEnd();
  expect(vi.mocked(rpc).mock.calls.filter(([name, body]) => name === 'read_explore' && body?.p_rank_page === 3)).toHaveLength(0);
  app.dispose();
});

it('keeps existing rows on a load-more error and retries the same page only on request', async () => {
  const app = setup();
  await screen.findByRole('link', { name: /all-all-1/ });
  const original = vi.mocked(rpc).getMockImplementation()!;
  vi.mocked(rpc).mockImplementation((name, body, signal) => name === 'read_explore' && body?.p_rank_page === 2 ? Promise.reject(new Error('추가 조회 실패')) : original(name, body, signal));
  await intersectRankingEnd();
  await screen.findByText('추가 조회 실패');
  expect(screen.getByRole('link', { name: /all-all-1/ })).toBeTruthy();
  await intersectRankingEnd();
  expect(vi.mocked(rpc).mock.calls.filter(([name, body]) => name === 'read_explore' && body?.p_rank_page === 2)).toHaveLength(1);
  vi.mocked(rpc).mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  await screen.findByRole('link', { name: /all-all-2/ });
  expect(screen.getByRole('link', { name: /all-all-1/ })).toBeTruthy();
  expect(screen.queryByText('추가 조회 실패')).toBeNull();
  app.dispose();
});

it('does not append a delayed page after switching ranking filters', async () => {
  const app = setup();
  await screen.findByRole('link', { name: /all-all-1/ });
  const original = vi.mocked(rpc).getMockImplementation()!;
  let resolvePage!: (value: unknown) => void;
  vi.mocked(rpc).mockImplementation((name, body, signal) => name === 'read_explore' && !body?.p_category_id && body?.p_rank_page === 2 ? new Promise(resolve => { resolvePage = resolve; }) : original(name, body, signal));
  await intersectRankingEnd();
  await waitFor(() => expect(resolvePage).toBeTypeOf('function'));
  const content = document.querySelector<HTMLElement>('.panel-content')!;
  content.scrollTop = 200;
  fireEvent.click(screen.getByRole('tab', { name: '카페' }));
  await screen.findByRole('link', { name: /all-cafe-1/ });
  await act(async () => resolvePage({ pins: [], rankingPage: [{ targetId: 'late', name: '이전 조건의 늦은 항목', kind: 'PLACE', count: 1, rank: 21 }], hasMore: false }));
  expect(screen.queryByText('이전 조건의 늦은 항목')).toBeNull();
  expect(screen.queryByRole('link', { name: /all-all-1/ })).toBeNull();
  expect(content.scrollTop).toBe(0);
  app.dispose();
});
