// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import ExplorePage, { RankingsPanel } from '../routes/Explore';
import { MapPanel } from '../components/MapScene';
import TargetPage from '../routes/Target';
import { rpc } from '../lib/api';
vi.mock('../components/Map', () => ({ MapView: () => { return <div data-testid="shared-map">지도</div>; } }));
vi.mock('../lib/api', async original => ({ ...await original<typeof import('../lib/api')>(), rpc: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const categoryId = 'food', rows = Array.from({ length: 21 }, (_, i) => ({ targetId: `place-${i}`, name: `장소 ${i}`, kind: 'PLACE', rank: i + 1, count: 21 - i }));
function setup(initial = '/') {
  vi.mocked(rpc).mockImplementation(async (name, body) => {
    if (name === 'read_catalog') return { allTeams: [], selectableTeams: [], allCategories: [{ id: categoryId, name: '맛집' }], selectableCategories: [], revision: '1', dataEpoch: 'epoch' };
    if (name === 'read_explore') return { pins: [], rankingPage: body?.p_rank_page === 2 ? rows.slice(20) : rows.slice(0, 20), hasMore: body?.p_rank_page !== 2, revision: '1', dataEpoch: 'epoch' };
    if (name === 'read_target') return { target: { id: body?.p_target_id, name: '선택 장소', kind: 'PLACE', lng: 127, lat: 37, address: '서울' }, favorites: [{ id: body?.p_cursor ? 'second' : 'first', nickname: body?.p_cursor ? '두 번째 동료' : '첫 번째 동료', teamName: '팀', categoryName: '맛집', message: '최애 문구', photos: [], createdAt: '2026-10-13' }], nextCursor: body?.p_cursor ? null : 'next', revision: '1', dataEpoch: 'epoch', totalCount: 2, filteredCount: 2 };
    throw new Error('unexpected RPC');
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const router = createMemoryRouter([{ element: <ExplorePage/>, children: [{ path: '/', element: null }, { path: '/rankings', element: <RankingsPanel/> }, { path: '/targets/:id', element: <TargetPage/> }] }], { initialEntries: [initial] });
  render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);
  return { client, router };
}
it('keeps the same map DOM and closes detail directly to the filtered main map', async () => {
  const { router, client } = setup('/rankings?category=food');
  const map = screen.getByTestId('shared-map');
  fireEvent.click(await screen.findByRole('button', { name: '다음 20건 보기' }));
  fireEvent.click(await screen.findByRole('link', { name: /장소 20/ }));
  await screen.findByRole('heading', { name: '선택 장소' });
  expect(screen.getByTestId('shared-map')).toBe(map);
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await screen.findByRole('heading', { name: '동료들의 요즘 최애' });
  expect(router.state.location.pathname).toBe('/');
  expect(router.state.location.search).toContain('category=food');
  expect(router.state.location.search).not.toContain('rankPage');
  expect(screen.getByTestId('shared-map')).toBe(map);
  router.dispose(); client.clear();
});
it('appends target comments using the first snapshot revision', async () => {
  const { router, client } = setup('/targets/place-0?team=other&category=food');
  await screen.findByText('첫 번째 동료');
  expect(vi.mocked(rpc).mock.calls.find(([name]) => name === 'read_target')?.[1]).toMatchObject({ p_team_id: null, p_category_id: null });
  expect(screen.queryByRole('combobox', { name: '팀 필터' })).toBeNull();
  expect(vi.mocked(rpc).mock.calls.find(([name]) => name === 'read_explore')?.[1]).toMatchObject({ p_team_id: null, p_category_id: null });
  fireEvent.click(screen.getByRole('button', { name: '최애 더 보기' }));
  await screen.findByText('두 번째 동료');
  expect(screen.getByText('첫 번째 동료')).toBeTruthy();
  expect(vi.mocked(rpc).mock.calls.find(([, b]) => b?.p_cursor === 'next')?.[1]?.p_expected_revision).toBe('1');
  router.dispose(); client.clear();
});
it('main shows five ranks even after visiting the second ranking page', async () => {
  const { router, client } = setup();
  const panel = await screen.findByRole('region', { name: '동료들의 요즘 최애' });
  await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(5));
  fireEvent.click(screen.getByRole('link', { name: '전체 랭킹 보기' }));
  fireEvent.click(await screen.findByRole('button', { name: '다음 20건 보기' }));
  await screen.findByRole('link', { name: /장소 20/ });
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  await screen.findByRole('heading', { name: '동료들의 요즘 최애' });
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.queryByRole('link', { name: /장소 20/ })).toBeNull();
  router.dispose(); client.clear();
});

it('snaps a dragged sheet from its pointer distance, without waiting for CSS animation', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  HTMLElement.prototype.setPointerCapture = vi.fn();
  render(<MapPanel title="드래그 검증">내용</MapPanel>);
  const handle = screen.getByRole('button', { name: '시트 높이 조절' });
  const panel = screen.getByRole('region', { name: '드래그 검증' });
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ height: 430 } as DOMRect);
  const pointer = (type: string, y: number) => { const e = new Event(type, { bubbles: true }); Object.assign(e, { clientY: y, pointerId: 1 }); fireEvent(handle, e); };
  pointer('pointerdown', 300); pointer('pointermove', 50); pointer('pointerup', 50);
  expect(panel.classList.contains('size-expanded')).toBe(true);
  expect(panel.classList.contains('dragging')).toBe(false);
  vi.unstubAllGlobals();
});

it('starts with all teams and categories instead of forcing food', async () => {
 const { router, client } = setup();
 await screen.findByRole('heading', { name: '동료들의 요즘 최애' });
 await waitFor(() => expect(vi.mocked(rpc).mock.calls.some(([name, body]) => name === 'read_explore' && body?.p_category_id === null && body?.p_team_id === null)).toBe(true));
 router.dispose(); client.clear();
});

it('reuses one detail panel across repeated selections and closes to main in one action', async () => {
 const { router, client } = setup('/');
 fireEvent.click(await screen.findByRole('link', { name: /장소 0/ }));
 await screen.findByRole('heading', { name: '선택 장소' });
 const panel = screen.getByRole('region', { name: '선택 장소' });
 const content = panel.querySelector('.panel-content')!; content.scrollTop = 150;
 await act(async () => { await router.navigate('/targets/place-1', { replace: true }); });
 await screen.findByRole('heading', { name: '선택 장소' });
 expect(screen.getByRole('region', { name: '선택 장소' })).toBe(panel);
 expect(content.scrollTop).toBe(0);
 expect(document.querySelectorAll('[data-map-panel]')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
 await screen.findByRole('heading', { name: '동료들의 요즘 최애' });
 expect(router.state.location.pathname).toBe('/');
 router.dispose(); client.clear();
});
