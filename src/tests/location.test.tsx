// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MapView } from '../components/Map';
const sdk = vi.hoisted(() => ({ center: vi.fn(), geolocation: vi.fn(), level: vi.fn(), getLevel: vi.fn(() => 5) }));
vi.mock('../lib/maps', () => ({ loadMap: async () => {}, kakao: () => ({
 Map: class { setCenter = sdk.center; getCenter = () => ({ getLng: () => 127, getLat: () => 37 }); relayout() {} getProjection() { return { containerPointFromCoords: (p: { lng: number; lat: number }) => ({ x: p.lng, y: p.lat }), coordsFromContainerPoint: (p: { x: number; y: number }) => ({ lat: p.y, lng: p.x, getLng: () => p.x, getLat: () => p.y }) }; } getLevel = sdk.getLevel; setLevel = sdk.level; },
 LatLng: class { constructor(public lat: number, public lng: number) {} }, Point: class { constructor(public x: number, public y: number) {} },
 Marker: class { setPosition() {} setTitle() {} setMap() {} },
 Polyline: class { setPath() {} setMap() {} },
 CustomOverlay: class { constructor({ content }: { content: HTMLElement }) { document.body.append(content); } setPosition() {} setMap() {} setContent() {} setZIndex() {} },
 event: { addListener() {}, removeListener() {} },
}) }));
afterEach(() => { cleanup(); document.querySelectorAll('.user-location-dot').forEach(x => x.remove()); vi.unstubAllGlobals(); vi.clearAllMocks(); sdk.getLevel.mockReturnValue(5); });
it('gets browser location and displays a blue location dot instead of moving to Samsung station', async () => {
 vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
 Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: sdk.geolocation } });
 sdk.geolocation.mockImplementation(success => success({ coords: { latitude: 35.16, longitude: 129.16 } }));
 render(<MapView fullscreen/>);
 await waitFor(() => expect(document.querySelector('.map')).toBeTruthy());
 fireEvent.click(screen.getByRole('button', { name: /내 위치|삼성역 중심으로/ }));
 await waitFor(() => expect(sdk.geolocation).toHaveBeenCalled());
 expect(document.querySelector('.user-location-dot')).toBeTruthy();
 expect(sdk.center).toHaveBeenLastCalledWith(expect.objectContaining({ lat: 35.16, lng: 129.16 }));
});

it.each([[5, 3], [2, 2]])('focuses a selected search place from level %i at level %i without resetting subsequent zoom', async (initialLevel, expectedLevel) => {
 vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
 sdk.getLevel.mockReturnValue(initialLevel);
 const { rerender } = render(<MapView/>);
 await waitFor(() => expect(screen.getByRole('region')).toBeTruthy());
 expect(sdk.level).not.toHaveBeenCalled();
 rerender(<MapView focusPoint={[127.0632, 37.5088]} focusLevel={3}/>);
 await waitFor(() => expect(sdk.level).toHaveBeenCalledWith(expectedLevel));
 expect(sdk.center).toHaveBeenLastCalledWith(expect.objectContaining({ lng: 127.0632, lat: 37.5088 }));
 const callCount = sdk.level.mock.calls.length;
 rerender(<MapView focusPoint={[127.0632, 37.5088]} focusLevel={3}/>);
 expect(sdk.level).toHaveBeenCalledTimes(callCount);
});

it.each([[5, 3], [2, 2]])('focuses place detail selection from level %i at level %i', async (initialLevel, expectedLevel) => {
 sdk.getLevel.mockReturnValue(initialLevel);
 vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
 const { MapScene, useMapGeometry } = await import('../components/MapScene');
 function DetailSelection() {
   const setGeometry = useMapGeometry();
   return <button onClick={() => setGeometry({ id: 'detail', kind: 'PLACE', name: '상세 대상', lng: 127.0632, lat: 37.5088, address: '서울', points: null, approximateLengthM: null, version: 1 })}>상세 열기</button>;
 }
 render(<MapScene><DetailSelection/></MapScene>);
 await waitFor(() => expect(screen.getByRole('button', { name: '내 위치' }).hasAttribute('disabled')).toBe(false));
 fireEvent.click(screen.getByRole('button', { name: '상세 열기' }));
 await waitFor(() => expect(sdk.level).toHaveBeenCalledWith(expectedLevel));
 sdk.level.mockClear(); sdk.getLevel.mockReturnValue(7);
 fireEvent.click(screen.getByRole('button', { name: '상세 열기' }));
 expect(sdk.level).not.toHaveBeenCalled();
});

it('focuses a different target at the same coordinates after the user zooms out', async () => {
 vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
 const { rerender } = render(<MapView selectedId="first" focusPoint={[127.0632, 37.5088]} focusLevel={3}/>);
 await waitFor(() => expect(sdk.level).toHaveBeenCalledWith(3));
 sdk.level.mockClear(); sdk.getLevel.mockReturnValue(7);
 rerender(<MapView selectedId="second" focusPoint={[127.0632, 37.5088]} focusLevel={3}/>);
 await waitFor(() => expect(sdk.level).toHaveBeenCalledWith(3));
});
