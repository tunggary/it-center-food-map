// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from '../routes/Admin';
import { edge } from '../lib/api';
vi.mock('../lib/auth', () => ({ adminToken: vi.fn().mockResolvedValue('admin-test'), adminClient: vi.fn() }));
vi.mock('../lib/api', async original => ({ ...await original<typeof import('../lib/api')>(), edge: vi.fn() }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('keeps an uncertain deletion after its target card disappears, then explicitly replays the exact command', async () => {
  const id = 'b3a184e2-56fc-4e6e-bd7f-09454680579a';
  const target = { id, name: '삭제 재시도 대상', kind: 'PLACE', count: 1, version: 4, points: null };
  let serverTargets: typeof target[] = [target];
  const commands: unknown[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(edge).mockImplementation(async (path, options = {}) => {
    if (path === '/admin/catalog') return { allTeams: [], allCategories: [], selectableTeams: [], selectableCategories: [], revision: '1', dataEpoch: 'epoch' };
    if (path.startsWith('/admin/targets?q=')) return { targets: serverTargets, nextCursor: null };
    if (path.endsWith('/deletion-preview')) return { targetId: id, name: target.name, version: 4, count: 1 };
    if (options.method === 'DELETE') {
      commands.push(options.body);
      if (commands.length === 1) { serverTargets = []; throw new TypeError('Failed to fetch'); }
      return { resourceId: id, revision: '2', replayed: true };
    }
    throw new Error(`Unexpected request ${path}`);
  });
  render(<MemoryRouter><QueryClientProvider client={client}><AdminPage/></QueryClientProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: '등록·코스·삭제' }));
  fireEvent.click(await screen.findByRole('button', { name: '전체 삭제 영향 확인' }));
  fireEvent.click(await screen.findByRole('button', { name: /^삭제$/ }));
  await screen.findByRole('button', { name: '같은 요청으로 결과 확인' });
  await client.invalidateQueries({ queryKey: ['admin-targets'] });
  await waitFor(() => expect(screen.queryByRole('button', { name: '전체 삭제 영향 확인' })).toBeNull());
  expect(screen.getByRole('dialog').hasAttribute('open')).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('연결이 잠시 어려워요');
  expect(commands).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '같은 요청으로 결과 확인' }));
  await screen.findByText('삭제 결과를 확인했어요.');
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(commands[1]).toMatchObject({ expectedVersion: 4, expectedCount: 1 });
  expect(screen.queryByRole('dialog')).toBeNull();
  client.clear();
});
