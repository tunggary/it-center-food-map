// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { TargetDetail } from '../../shared/contracts';
import TargetPage from '../routes/Target';
import { ToastHost } from '../components/Toast';
import { rpc } from '../lib/api';

vi.mock('../lib/api', async original => ({ ...await original<typeof import('../lib/api')>(), rpc: vi.fn() }));
vi.mock('../lib/participant', () => ({ useParticipant: () => ({ token: null, participant: null }) }));
beforeAll(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => undefined }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const response: TargetDetail = { revision: '1', dataEpoch: 'epoch', target: { id: 'place', kind: 'PLACE', name: '긴 장소 이름', address: '서울특별시 강남구 테헤란로 123', lng: 127, lat: 37, points: null, approximateLengthM: null, version: 1 }, filteredCount: 2, totalCount: 2, overallRank: 2, overallRankTied: true, favorites: [], nextCursor: null };
function setup(detail = response) {
  vi.mocked(rpc).mockImplementation(async name => name === 'read_target' ? detail : { allTeams: [], allCategories: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const router = createMemoryRouter([{ path: '/targets/:id', element: <TargetPage/> }], { initialEntries: ['/targets/place?rankingTab=custom&team=other&category=cafe&rankPage=2'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router}/><ToastHost/></QueryClientProvider>);
  return client;
}
it.each([1, 2, 3, 4])('uses global rank %i and only top three trophies independent of the return filter', async rank => {
  setup({ ...response, overallRank: rank, overallRankTied: false });
  await screen.findByText(`전체 랭킹 ${rank}위`);
  const heading = screen.getByRole('heading', { name: response.target.name });
  expect(heading.querySelector(`.trophy-${rank}`) !== null).toBe(rank <= 3);
  expect(screen.getByText(response.target.address!).closest('.panel-heading')).toBeTruthy();
  expect(vi.mocked(rpc).mock.calls.find(([name]) => name === 'read_target')?.[1]).toMatchObject({ p_team_id: null, p_category_id: null });
  expect(vi.mocked(rpc).mock.calls.some(([name]) => name === 'read_explore')).toBe(false);
});
it('copies exactly the displayed address and announces success', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as unknown as Clipboard);
  setup();
  fireEvent.click(await screen.findByRole('button', { name: '주소 복사하기' }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('주소를 복사했어요.'));
  expect(writeText).toHaveBeenCalledWith(response.target.address);
  expect(screen.getByText('전체 랭킹 공동 2위')).toBeTruthy();
});
it.each(['denied', 'unsupported'])('announces copy failure (%s) and leaves the address available', async mode => {
  const writeText = vi.fn().mockRejectedValue(new Error('denied'));
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(mode === 'denied' ? { writeText } as unknown as Clipboard : undefined as unknown as Clipboard);
  setup();
  fireEvent.click(await screen.findByRole('button', { name: '주소 복사하기' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('주소를 복사하지 못했어요.'));
  expect(screen.getByText(response.target.address!)).toBeTruthy();
  expect(screen.getByRole('button', { name: '주소 복사하기' })).toBeTruthy();
});
it('has no copy action or trophy for a place with no address or registrations', async () => {
  setup({ ...response, target: { ...response.target, address: null }, totalCount: 0, overallRank: null, overallRankTied: false });
  await screen.findByText('전체 랭킹 순위 없음');
  expect(screen.getByText('주소 정보 없음')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '주소 복사하기' })).toBeNull();
  expect(document.querySelector('.rank-trophy')).toBeNull();
});
it('shows the same ranking for courses while keeping course information without a copy action', async () => {
  setup({ ...response, target: { ...response.target, kind: 'COURSE', address: null, points: [[127, 37], [127.1, 37.1]], approximateLengthM: 123 } });
  await screen.findByText('전체 랭킹 공동 2위');
  expect(screen.getByText('함께 걷는 산책코스').closest('.panel-heading')).toBeTruthy();
  expect(screen.getByText('참고 선 거리 123m')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '주소 복사하기' })).toBeNull();
});
it('updates count, rank and trophy together after detail invalidation', async () => {
  const client = setup();
  await screen.findByText('전체 랭킹 공동 2위');
  vi.mocked(rpc).mockImplementation(async name => name === 'read_target' ? { ...response, revision: '2', totalCount: 5, overallRank: 1, overallRankTied: false } : {});
  await client.invalidateQueries({ queryKey: ['target-pages'] });
  await screen.findByText('전체 랭킹 1위');
  await waitFor(() => expect(document.querySelector('.trophy-1')).toBeTruthy());
  expect(screen.getByText('5명')).toBeTruthy();
});
it.each([
  { message: '', photos: [] },
  { message: '', photos: [{ assetId: 'photo', slot: 1 as const }] },
  { message: '소개', photos: [] },
  { message: '소개', photos: [{ assetId: 'photo', slot: 1 as const }] },
])('keeps registration cards with optional content: %j', async content => {
  setup({ ...response, totalCount: 1, filteredCount: 1, favorites: [{ id: 'favorite', targetId: 'place', participantId: 'person', nickname: '동료', teamId: 'team', teamName: 'A팀', categoryId: 'category', categoryName: '맛집', version: 1, createdAt: '2026-10-14T15:05:00Z', ...content }] });
  await screen.findByText('동료');
  expect(document.querySelectorAll('.comment')).toHaveLength(1);
  expect(document.querySelectorAll('.comment .message')).toHaveLength(content.message ? 1 : 0);
  expect(document.querySelectorAll('.comment .photos img')).toHaveLength(content.photos.length);
  expect(screen.getByText('A팀 · 맛집')).toBeTruthy();
  expect(screen.getByText('1명')).toBeTruthy();
});
