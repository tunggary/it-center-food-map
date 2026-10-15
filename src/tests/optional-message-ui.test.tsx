// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import RegisterPage from '../routes/Register';
import MePage from '../routes/Me';
import { edge, rpc } from '../lib/api';
vi.mock('../lib/identity', async original => ({ ...await original<typeof import('../lib/identity')>(), prepareIdentity: async () => 'participant' }));
vi.mock('../lib/participant', () => ({ useParticipant: () => ({ token: 'participant', participant: { id: 'me' }, me: {} }) }));
vi.mock('../lib/api', async original => ({ ...await original<typeof import('../lib/api')>(), edge: vi.fn(), rpc: vi.fn() }));
vi.mock('../components/Map', () => ({ MapView: () => <div/> }));
vi.mock('../features/media/PhotoPicker', () => ({ PhotoPicker: () => <div/> }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const targetId = '11111111-1111-4111-8111-111111111111', categoryId = '22222222-2222-4222-8222-222222222222', favoriteId = '33333333-3333-4333-8333-333333333333';
const target = { id: targetId, name: '선택 검증 장소', kind: 'PLACE' as const, lng: 127, lat: 37 };
function setup(edit = false, me = false) {
  let favorite = { id: favoriteId, targetId, target, participantId: 'me', nickname: '작성자', teamName: 'A팀', categoryId, categoryName: '맛집', message: edit ? '기존 소개' : '', photos: [], version: 1, createdAt: '2026-10-15' };
  const bodies: unknown[] = [];
  vi.mocked(rpc).mockImplementation(async name => name === 'read_catalog' ? { selectableCategories: [{ id: categoryId, name: '맛집', kind: 'PLACE' }], allCategories: [], allTeams: [], selectableTeams: [] } : { target, favorites: [favorite], totalCount: 1, nextCursor: null, revision: '1' });
  vi.mocked(edge).mockImplementation(async (path, options) => {
    if (path === '/me') return { id: 'me', nickname: '작성자', teamName: 'A팀' };
    if (path.startsWith('/me/favorites')) return { favorites: [favorite], nextCursor: null };
    if (path === '/favorites' || path === `/favorites/${favoriteId}`) {
      bodies.push(options!.body); favorite = { ...favorite, ...(options!.body as { message: string }) };
      return { resourceId: favoriteId, targetId, revision: '2' };
    }
    throw new Error(path);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const router = createMemoryRouter([{ path: '/register/places', element: <RegisterPage/> }, { path: '/me/favorites', element: <MePage/> }, { path: '/targets/:id', element: <p>등록 완료</p> }], { initialEntries: [me ? '/me/favorites' : { pathname: '/register/places', search: `?target=${targetId}${edit ? `&favorite=${favoriteId}` : ''}`, state: { target } }] });
  render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);
  return { bodies, router, client };
}
it.each([false, true])('submits an empty introduction and no photos (edit=%s)', async edit => {
  const app = setup(edit);
  const textarea = await screen.findByLabelText(/최애를 소개하는 한마디/);
  expect((textarea as HTMLTextAreaElement).required).toBe(false);
  if (edit) {
    await screen.findByRole('heading', { name: '내 최애 수정' });
    fireEvent.change(textarea, { target: { value: '' } });
  } else fireEvent.change(screen.getByLabelText('카테고리'), { target: { value: categoryId } });
  fireEvent.submit(document.querySelector('#favorite-form')!);
  await screen.findByText('등록 완료');
  expect(app.bodies).toHaveLength(1);
  expect(app.bodies[0]).toMatchObject({ message: '', photos: [], categoryId });
  app.router.dispose(); app.client.clear();
});
it('keeps the owner card and management link without a message or photos', async () => {
  const app = setup(false, true);
  await screen.findByRole('heading', { name: target.name });
  expect(screen.getByText('맛집')).toBeTruthy();
  expect(screen.getByRole('link', { name: '수정·삭제' })).toBeTruthy();
  expect(document.querySelector('.favorite .message')).toBeNull();
  app.router.dispose(); app.client.clear();
});
