// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MapView } from '../components/Map';
const sdk = vi.hoisted(() => ({ center: vi.fn(), geolocation: vi.fn() }));
vi.mock('../lib/maps', () => ({ loadMap: async () => {}, kakao: () => ({
 Map: class { setCenter = sdk.center; getCenter = () => ({ getLng: () => 127, getLat: () => 37 }); relayout() {} getProjection() { return { containerPointFromCoords: (p: { lng: number; lat: number }) => ({ x: p.lng, y: p.lat }), coordsFromContainerPoint: (p: { x: number; y: number }) => ({ lat: p.y, lng: p.x, getLng: () => p.x, getLat: () => p.y }) }; } getLevel() { return 5; } setLevel() {} },
 LatLng: class { constructor(public lat: number, public lng: number) {} }, Point: class { constructor(public x: number, public y: number) {} },
 Polyline: class { setPath() {} setMap() {} },
 CustomOverlay: class { constructor({ content }: { content: HTMLElement }) { document.body.append(content); } setPosition() {} setMap() {} },
 event: { addListener() {}, removeListener() {} },
}) }));
afterEach(() => { cleanup(); document.querySelectorAll('.user-location-dot').forEach(x => x.remove()); vi.unstubAllGlobals(); vi.clearAllMocks(); });
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
