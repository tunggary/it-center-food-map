// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import RegisterEntry from '../routes/RegisterEntry';
import { MapToolbar } from '../components/MapScene';

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock('../lib/viewport', () => ({ useMobileScreen: () => viewport.mobile }));
vi.mock('../components/Map', () => ({ MapView: () => <div/> }));
vi.mock('../routes/Register', () => ({ default: () => <p>기존 등록 폼</p> }));
afterEach(() => { cleanup(); viewport.mobile = true; });

function mount(search = '', state?: unknown) {
  const router = createMemoryRouter([
    { path: '/', element: <p>메인 지도</p> },
    { path: '/register', element: <RegisterEntry/> },
    { path: '/register/places', element: <p>장소 검색 화면</p> },
    { path: '/courses/new', element: <p>경로 지정 화면</p> },
  ], { initialEntries: [{ pathname: '/register', search, state }] });
  render(<RouterProvider router={router}/>);
  return router;
}
it.each([
  ['장소 등록', '/register/places'], ['경로 등록', '/courses/new'],
])('opens %s and returns to the choice panel with filters preserved', async (label, path) => {
  const router = mount('?return=team%3Dtest%26category%3Dfood');
  fireEvent.click(screen.getByRole('link', { name: label }));
  expect(router.state.location.pathname).toBe(path);
  expect(new URLSearchParams(router.state.location.search).get('return')).toBe('team=test&category=food');
  await router.navigate(-1);
  expect(await screen.findByRole('heading', { name: '최애 등록하기' })).toBeTruthy();
});
it.each(['?target=target-id', '?favorite=favorite-id'])('bypasses selection for %s', search => {
  mount(search);
  expect(screen.getByText('기존 등록 폼')).toBeTruthy();
  expect(screen.queryByRole('link', { name: '장소 등록' })).toBeNull();
});
it('bypasses selection for a favorite passed in navigation state', () => {
  mount('', { favorite: { id: 'favorite-id' } });
  expect(screen.getByText('기존 등록 폼')).toBeTruthy();
});
it('closes the selection panel to the map with the original filters', () => {
  const router = mount('?return=team%3Dtest');
  fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
  expect(router.state.location.pathname).toBe('/');
  expect(router.state.location.search).toBe('?team=test');
});
it('removes the mobile registration menu while keeping the main menu and desktop links', () => {
  const router = createMemoryRouter([{ path: '/', element: <MapToolbar hideMobileMenu/> }]);
  const { rerender } = render(<RouterProvider router={router}/>);
  expect(document.querySelector('.map-toolbar')).toBeNull();
  viewport.mobile = false;
  rerender(<RouterProvider router={createMemoryRouter([{ path: '/', element: <MapToolbar hideMobileMenu/> }])}/>);
  expect(screen.getByRole('link', { name: '내 정보' })).toBeTruthy();
  viewport.mobile = true;
  rerender(<RouterProvider router={createMemoryRouter([{ path: '/', element: <MapToolbar/> }])}/>);
  expect(screen.getByRole('button', { name: '개인 메뉴 열기' })).toBeTruthy();
});
