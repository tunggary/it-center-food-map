// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Pin } from '../../shared/contracts';
import { ClusteredPins } from '../components/ClusteredPins';
const sdk = vi.hoisted(() => ({ listeners: new Map<string, Set<() => void>>(), scale: 1, removed: vi.fn(), preventMap: vi.fn(), position: vi.fn(), markerZIndex: vi.fn() }));
vi.mock('../lib/maps', () => ({ kakao: () => ({
  LatLng: class { constructor(public lat: number, public lng: number) {} },
  Point: class { constructor(public x: number, public y: number) {} },
  Marker: class { setPosition = sdk.position; setZIndex = sdk.markerZIndex; setTitle() {} setMap(value: unknown) { if (!value) sdk.removed(); } },
  CustomOverlay: class { button: HTMLElement; constructor({ content }: { content: HTMLElement }) { this.button = content; document.body.append(content); } setPosition() {} setContent() {} setZIndex() {} setMap(value: unknown) { if (!value) this.button.remove(); } },
  event: { preventMap: sdk.preventMap, addListener: (_: unknown, event: string, callback: () => void) => { if (!sdk.listeners.has(event)) sdk.listeners.set(event, new Set()); sdk.listeners.get(event)!.add(callback); }, removeListener: (_: unknown, event: string, callback: () => void) => sdk.listeners.get(event)?.delete(callback) },
}) }));
const map = { getProjection: () => ({ containerPointFromCoords: (p: { lng: number; lat: number }) => ({ x: p.lng * sdk.scale, y: p.lat }), coordsFromContainerPoint: (p: unknown) => p }) };
const pins: Pin[] = [
  { targetId: 'a', name: '가 장소', kind: 'PLACE', lng: 100, lat: 100, count: 2 },
  { targetId: 'b', name: '나 코스', kind: 'COURSE', lng: 120, lat: 100, count: 5 },
];
const emit = (event: string) => act(() => sdk.listeners.get(event)?.forEach(callback => callback()));
beforeEach(() => {
  vi.clearAllMocks();
  sdk.scale = 1; sdk.listeners.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) { return { x: 0, y: 0, left: 0, top: 0, right: this.tagName === 'BUTTON' ? 100 : 800, bottom: this.tagName === 'BUTTON' ? 34 : 600, width: this.tagName === 'BUTTON' ? 100 : 800, height: this.tagName === 'BUTTON' ? 34 : 600, toJSON() {} }; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('opens a sorted mixed list without selecting, then selects the exact item', async () => {
  const select = vi.fn(); render(<div><ClusteredPins map={map} pins={pins} onSelect={select}/></div>);
  fireEvent.click(await screen.findByRole('button', { name: '장소·코스 2개 목록 열기' }));
  const dialog = await screen.findByRole('dialog');
  expect(select).not.toHaveBeenCalled();
  expect(within(dialog).getAllByRole('listitem')[0].textContent).toContain('나 코스');
  fireEvent.click(within(dialog).getByRole('button', { name: /나 코스/ }));
  expect(select).toHaveBeenCalledWith('b'); expect(screen.queryByRole('dialog')).toBeNull();
});
it('dismisses via Escape with focus restored, and on map movement', async () => {
  render(<div><ClusteredPins map={map} pins={pins}/></div>);
  const button = await screen.findByRole('button', { name: '장소·코스 2개 목록 열기' }); fireEvent.click(button);
  fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
  expect(document.activeElement).toBe(button);
  fireEvent.click(button); emit('zoom_start'); expect(screen.queryByRole('dialog')).toBeNull();
});
it('splits on zoom when overlap drops below 50%, even while labels still touch', async () => {
  const select = vi.fn(); render(<div><ClusteredPins map={map} pins={pins} onSelect={select}/></div>);
  await screen.findByRole('button', { name: '장소·코스 2개 목록 열기' });
  sdk.scale = 2.6; emit('idle');
  fireEvent.click(await screen.findByRole('button', { name: '가 장소 선택' })); expect(select).toHaveBeenCalledWith('a');
  expect(screen.queryByRole('button', { name: /목록 열기/ })).toBeNull();
});
it('keeps exactly coincident targets available in the list after zooming', async () => {
  render(<div><ClusteredPins map={map} pins={pins.map(p => ({ ...p, lng: 100 }))}/></div>);
  await screen.findByRole('button', { name: '장소·코스 2개 목록 열기' });
  sdk.scale = 20; emit('idle');
  fireEvent.click(await screen.findByRole('button', { name: '장소·코스 2개 목록 열기' }));
  expect(within(await screen.findByRole('dialog')).getAllByRole('listitem')).toHaveLength(2);
});
it('combines overlapping generated badges into one selectable list and splits them again on zoom', async () => {
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function(this: HTMLElement) {
    const button = this.tagName === 'BUTTON', width = button ? (this.classList.contains('pin-cluster') ? 120 : 10) : 800;
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: button ? 34 : 600, width, height: button ? 34 : 600, toJSON() {} };
  });
  const nearby = [{ ...pins[0], lng: 100 }, { ...pins[1], lng: 101 }, { ...pins[0], targetId: 'c', name: '다 장소', lng: 150 }, { ...pins[1], targetId: 'd', name: '라 코스', lng: 151 }];
  render(<div><ClusteredPins map={map} pins={nearby}/></div>);
  fireEvent.click(await screen.findByRole('button', { name: '장소·코스 4개 목록 열기' }));
  expect(within(await screen.findByRole('dialog')).getAllByRole('listitem')).toHaveLength(4);
  sdk.scale = 2.5; emit('zoom_start'); emit('idle');
  expect(await screen.findAllByRole('button', { name: '장소·코스 2개 목록 열기' })).toHaveLength(2);
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('shows the chosen detail pin separately at its exact coordinates and restores clustering on close', async () => {
  const app = render(<div><ClusteredPins map={map} pins={pins}/></div>);
  await screen.findByRole('button', { name: '장소·코스 2개 목록 열기' });
  sdk.position.mockClear();
  app.rerender(<div><ClusteredPins map={map} pins={pins} selectedId="b"/></div>);
  const selected = await screen.findByRole('button', { name: '나 코스 선택' });
  expect(selected.classList.contains('selected')).toBe(true);
  expect(sdk.position).toHaveBeenCalledWith(expect.objectContaining({ lng: 120, lat: 100 }));
  expect(sdk.markerZIndex).toHaveBeenCalledWith(5);
  expect(screen.queryByRole('button', { name: '장소·코스 2개 목록 열기' })).toBeNull();
  app.rerender(<div><ClusteredPins map={map} pins={pins}/></div>);
  await screen.findByRole('button', { name: '장소·코스 2개 목록 열기' });
});
it('keeps the selected target separate even at identical coordinates while other pins remain grouped', async () => {
  const coincident = [...pins, { ...pins[0], targetId: 'c', name: '다 장소' }].map(pin => ({ ...pin, lng: 100 }));
  const app = render(<div><ClusteredPins map={map} pins={coincident} selectedId="b"/></div>);
  await screen.findByRole('button', { name: '나 코스 선택' });
  fireEvent.click(await screen.findByRole('button', { name: '장소·코스 2개 목록 열기' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
  expect(within(dialog).queryByText('나 코스')).toBeNull();
  app.rerender(<div><ClusteredPins map={map} pins={coincident} selectedId="a"/></div>);
  expect((await screen.findByRole('button', { name: '가 장소 선택' })).classList.contains('selected')).toBe(true);
});
it('refreshes counts, closes on filter changes, and removes listeners/overlays', async () => {
  const app = render(<div><ClusteredPins map={map} pins={pins} contextKey="all"/></div>);
  fireEvent.click(await screen.findByRole('button', { name: /목록 열기/ }));
  app.rerender(<div><ClusteredPins map={map} pins={pins.map(p => ({ ...p, count: 9 }))} contextKey="all"/></div>);
  await waitFor(() => expect(within(screen.getByRole('dialog')).getAllByText('최애 9')).toHaveLength(2));
  app.rerender(<div><ClusteredPins map={map} pins={pins} contextKey="filtered"/></div>);
  expect(screen.queryByRole('dialog')).toBeNull();
  app.unmount(); expect([...sdk.listeners.values()].every(set => !set.size)).toBe(true);
  expect(document.querySelector('.cluster-measure')).toBeNull();
  expect(sdk.removed).toHaveBeenCalled();
});
