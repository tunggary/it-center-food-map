// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import RegisterPage from '../routes/Register';
import { ApiError, edge, rpc } from '../lib/api';
vi.mock('../lib/identity', () => ({ prepareIdentity: vi.fn().mockResolvedValue('participant'), resetIdentity: vi.fn() }));
vi.mock('../lib/api', async original => ({ ...await original<typeof import('../lib/api')>(), edge: vi.fn(), rpc: vi.fn() }));
vi.mock('../features/media/PhotoPicker', () => ({ PhotoPicker: ({ photos, onChange }: { photos: { id: string }[]; onChange: (next: unknown[]) => void }) => <div><span>{photos.map(p => p.id).join(',')}</span><button type="button" onClick={() => onChange([...photos, { id: 'ready-photo', assetId: '33333333-3333-4333-8333-333333333333', prepareKey: 'ready', finalizeKey: 'ready', status: 'ready' }])}>준비된 사진 추가</button></div> }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('keeps failed input and photos while removing the general target reselection action', async () => {
  const id = 'b3a184e2-56fc-4e6e-bd7f-09454680579a';
  const courseId = '11111111-1111-4111-8111-111111111111', placeId = '22222222-2222-4222-8222-222222222222';
  const categories = [{ id: courseId, name: '산책', kind: 'COURSE', selectable: true, version: 1 }, { id: placeId, name: '맛집', kind: 'PLACE', selectable: true, version: 1 }];
  vi.mocked(rpc).mockImplementation(async name => {
    if (name === 'read_catalog') return { selectableTeams: [], allTeams: [], selectableCategories: categories, allCategories: categories, revision: '1', dataEpoch: 'epoch' };
    throw new ApiError('TARGET_GONE', '이 장소나 코스가 삭제됐어요. 다른 대상을 선택해 주세요.');
  });
  vi.mocked(edge).mockImplementation(async path => {
    if (path === '/me') return { id, nickname: '참여자', teamId: id, teamName: 'A팀', version: 1 };
    if (path.startsWith('/places/search')) return { places: [{ placeId: 'kakao-place', name: '새 장소', address: '새 주소', lng: 127, lat: 37, selectionToken: 'selection' }], isEnd: true };
    throw new ApiError('TARGET_GONE', '이 장소나 코스가 삭제됐어요. 다른 대상을 선택해 주세요.');
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/register', element: <RegisterPage/> }], { initialEntries: [{ pathname: '/register', search: `?target=${id}`, state: { target: { id, name: '옛 코스', kind: 'COURSE' } } }] });
  render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);
  await screen.findByText('이 장소나 코스가 삭제됐어요. 다른 대상을 선택해 주세요.');
  fireEvent.change(screen.getByLabelText('카테고리'), { target: { value: courseId } });
  fireEvent.change(screen.getByLabelText(/최애를 소개하는 한마디/), { target: { value: '문구는 유지해요' } });
  fireEvent.click(await screen.findByRole('button', { name: '준비된 사진 추가' }));
  fireEvent.click(screen.getByRole('button', { name: '최애 등록하기' }));
  await waitFor(() => expect(vi.mocked(edge).mock.calls.some(([path]) => path === '/favorites')).toBe(true));
  await waitFor(() => expect(screen.getByRole('button', { name: '최애 등록하기' }).hasAttribute('disabled')).toBe(false));
  expect(screen.queryByRole('button', { name: '대상 다시 선택' })).toBeNull();
  expect((screen.getByLabelText(/최애를 소개하는 한마디/) as HTMLTextAreaElement).value).toBe('문구는 유지해요');
  expect(await screen.findByText('ready-photo')).toBeTruthy();
  expect(screen.getByRole('link', { name: '작성 취소' })).toBeTruthy();
  router.dispose(); client.clear();
});
