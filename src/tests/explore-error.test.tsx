// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ExplorePage from '../routes/Explore';
import { ApiError, rpc } from '../lib/api';
vi.mock('../lib/api', async original => ({ ...await original<typeof import('../lib/api')>(), rpc: vi.fn() }));
vi.mock('../components/Map', () => ({ MapView: () => <div>지도 영역</div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('does not claim an empty ranking before its first snapshot has loaded or after an API failure', async () => {
  vi.mocked(rpc).mockImplementation(async name => {
    if (name === 'read_catalog') return { allTeams: [], allCategories: [], selectableTeams: [], selectableCategories: [], revision: '1', dataEpoch: 'epoch' };
    throw new ApiError('DEPENDENCY_UNAVAILABLE', '연결이 잠시 어려워요.');
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><ExplorePage/></QueryClientProvider></MemoryRouter>);
  expect(screen.getByText('랭킹을 불러오고 있어요…')).toBeTruthy();
  expect(screen.queryByText('우리의 첫 최애를 기다려요')).toBeNull();
  await screen.findByText('랭킹을 불러오지 못했어요');
  expect(screen.queryByText('우리의 첫 최애를 기다려요')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('연결이 잠시 어려워요');
  client.clear();
});
