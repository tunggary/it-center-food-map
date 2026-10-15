// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MapView } from '../components/Map';
import { MapScene, useMapGeometry } from '../components/MapScene';
import type { Point } from '../../shared/contracts';
const sdk = vi.hoisted(() => ({ bounds: vi.fn(), level: vi.fn(), center: vi.fn(), path: vi.fn(), observers: [] as { callback: () => void; observe: ReturnType<typeof vi.fn> }[], mobile: false, panelTop: 250 }));
vi.mock('../lib/maps', () => ({ loadMap: async () => {}, kakao: () => ({
  Map: class { setBounds = sdk.bounds; setLevel = sdk.level; setCenter = sdk.center; getLevel = () => 2; relayout() {} getCenter() { return { getLng: () => 127, getLat: () => 37 }; } getProjection() { return { containerPointFromCoords: () => ({ x: 640, y: 422 }), coordsFromContainerPoint: (p: unknown) => p }; } },
  LatLng: class { constructor(public lat: number, public lng: number) {} },
  LatLngBounds: class { points: unknown[] = []; extend(point: unknown) { this.points.push(point); } },
  Point: class { constructor(public x: number, public y: number) {} },
  Marker: class { setPosition() {} setTitle() {} setMap() {} },
  CustomOverlay: class { setPosition() {} setMap() {} setContent() {} setZIndex() {} },
  Polyline: class { setPath = sdk.path; setMap() {} },
  event: { addListener() {}, removeListener() {} },
}) }));
const points: Point[] = [[127, 37], [127.02, 37.01], [126.99, 37.025]];
function rect(left: number, top: number, width: number, height: number): DOMRect { return { x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON() {} }; }
beforeEach(() => {
  sdk.mobile = false; sdk.panelTop = 250; sdk.observers.length = 0; vi.clearAllMocks();
  vi.stubGlobal('matchMedia', () => ({ matches: sdk.mobile, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); constructor(callback: () => void) { sdk.observers.push({ callback, observe: this.observe }); } disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) { return this.hasAttribute('data-map-panel') ? sdk.mobile ? rect(0, sdk.panelTop, 390, 844 - sdk.panelTop) : rect(24, 84, 380, 700) : rect(0, 0, sdk.mobile ? 390 : 1280, 844); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function CourseSelection() {
  const setGeometry = useMapGeometry();
  return <button onClick={() => setGeometry({ id: 'course', kind: 'COURSE', name: '긴 경로', lng: points[0][0], lat: points[0][1], address: null, points: [...points], approximateLengthM: 4000, version: 1 })}>코스 상세</button>;
}
it('fits all course coordinates instead of fixing level 3 or centering only the start', async () => {
  render(<MapScene><CourseSelection/></MapScene>);
  await waitFor(() => expect(screen.getByRole('button', { name: '내 위치' }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: '코스 상세' }));
  await waitFor(() => expect(sdk.bounds).toHaveBeenCalled());
  expect(sdk.bounds.mock.lastCall?.[0].points).toEqual(points.map(([lng, lat]) => expect.objectContaining({ lng, lat })));
  expect(sdk.level).not.toHaveBeenCalled();
  expect(sdk.path).toHaveBeenLastCalledWith(points.map(([lng, lat]) => expect.objectContaining({ lng, lat })));
  const count = sdk.bounds.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '코스 상세' }));
  expect(sdk.bounds).toHaveBeenCalledTimes(count);
});
it.each([false, true])('fits around the occupied panel and refits when layout changes (mobile=%s)', async mobile => {
  sdk.mobile = mobile;
  render(<section className="map-scene"><MapView fullscreen points={points} fitPoints selectedId="course"/><aside data-map-panel/></section>);
  await waitFor(() => expect(sdk.bounds).toHaveBeenCalled());
  const before = sdk.bounds.mock.lastCall!;
  if (mobile) expect(before[3]).toBeGreaterThanOrEqual(844 - sdk.panelTop); else expect(before[4]).toBeGreaterThan(404);
  const count = sdk.bounds.mock.calls.length;
  sdk.panelTop = 150;
  act(() => sdk.observers.forEach(observer => observer.callback()));
  expect(sdk.bounds.mock.calls.length).toBeGreaterThan(count);
  if (mobile) expect(sdk.bounds.mock.lastCall![3]).toBeGreaterThan(before[3]);
});
it('refits another course with the same start but different endpoints', async () => {
  const app = render(<MapView fullscreen points={points} fitPoints selectedId="first"/>);
  await waitFor(() => expect(sdk.bounds).toHaveBeenCalled());
  sdk.bounds.mockClear();
  const changed: Point[] = [points[0], [127.1, 37.1]];
  app.rerender(<MapView fullscreen points={changed} fitPoints selectedId="second"/>);
  await waitFor(() => expect(sdk.bounds).toHaveBeenCalled());
  expect(sdk.bounds.mock.lastCall![0].points).toEqual(changed.map(([lng, lat]) => expect.objectContaining({ lng, lat })));
});
it('returns to the existing place zoom behavior after closing a course', async () => {
  const app = render(<MapView fullscreen points={points} fitPoints selectedId="course"/>);
  await waitFor(() => expect(sdk.bounds).toHaveBeenCalled());
  sdk.bounds.mockClear();
  app.rerender(<MapView fullscreen focusPoint={points[0]} focusLevel={3} selectedId="place"/>);
  await waitFor(() => expect(sdk.level).toHaveBeenCalledWith(2));
  expect(sdk.bounds).not.toHaveBeenCalled();
});
it('allows the current location button to move away from a fitted course', async () => {
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: 35, longitude: 129 } } as GeolocationPosition) } });
  render(<MapView fullscreen points={points} fitPoints selectedId="course"/>);
  await waitFor(() => expect(sdk.bounds).toHaveBeenCalled());
  sdk.bounds.mockClear();
  fireEvent.click(screen.getByRole('button', { name: '내 위치' }));
  await waitFor(() => expect(sdk.center).toHaveBeenCalledWith(expect.objectContaining({ lat: 35, lng: 129 })));
  expect(sdk.bounds).not.toHaveBeenCalled();
});
