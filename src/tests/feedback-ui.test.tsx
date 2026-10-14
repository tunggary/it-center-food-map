// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RankingTicker } from '../components/RankingTicker';
import { SideMenu } from '../components/SideMenu';
import { PhotoPicker } from '../features/media/PhotoPicker';
import { showToast, ToastHost } from '../components/Toast';
import type { Ranking } from '../../shared/contracts';
const items: Ranking[] = [{ targetId: 'a', rank: 1, name: '첫 장소', count: 5, kind: 'PLACE' }, { targetId: 'b', rank: 2, name: '다음 장소', count: 3, kind: 'PLACE' }];
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); }; HTMLElement.prototype.setPointerCapture = vi.fn(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
it('rolls live ranks and pauses while focused even after pointer leaves', () => {
 vi.useFakeTimers(); render(<MemoryRouter><RankingTicker items={items} query="" pending={false} failed={false}/></MemoryRouter>);
 act(() => vi.advanceTimersByTime(4000)); expect(screen.getByText('다음 장소')).toBeTruthy();
 const ticker = screen.getByRole('region', { name: '실시간 최애 랭킹' });
 fireEvent.focus(screen.getByRole('link', { name: /다음 장소/ })); fireEvent.mouseLeave(ticker);
 act(() => vi.advanceTimersByTime(8000)); expect(screen.getByText('다음 장소')).toBeTruthy();
 fireEvent.blur(screen.getByRole('link', { name: /다음 장소/ }), { relatedTarget: document.body });
 fireEvent.click(screen.getByRole('button', { name: '랭킹 자동 전환 일시정지' }));
 act(() => vi.advanceTimersByTime(8000)); expect(screen.getByText('다음 장소')).toBeTruthy();
});
it('handles updated and empty ticker data without stale links', () => {
 const { rerender } = render(<MemoryRouter><RankingTicker items={items} query="" pending={false} failed={false}/></MemoryRouter>);
 rerender(<MemoryRouter><RankingTicker items={[{ ...items[0], name: '갱신 장소', count: 8 }]} query="" pending={false} failed={false}/></MemoryRouter>); expect(screen.getByText('갱신 장소')).toBeTruthy();
 rerender(<MemoryRouter><RankingTicker items={[]} query="" pending={false} failed={false}/></MemoryRouter>); expect(screen.getByText('첫 최애를 기다려요')).toBeTruthy(); expect(screen.queryByText('갱신 장소')).toBeNull();
});
it('opens the side menu using an inward edge drag and closes via its button', () => {
 render(<MemoryRouter><SideMenu/></MemoryRouter>);
 const edge = document.querySelector('.menu-edge')!;
 const pointer = (type: string, x: number) => { const event = new Event(type, { bubbles: true }); Object.assign(event, { clientX: x, clientY: 200, pointerId: 1 }); fireEvent(edge, event); };
 pointer('pointerdown', 389); pointer('pointerup', 280);
 expect(screen.getByRole('dialog', { name: '내 메뉴' })).toBeTruthy(); expect(screen.getByRole('link', { name: '내 장소/코스' })).toBeTruthy();
 expect(screen.getByRole('link', { name: '내 정보' }).textContent).toBe('내 정보');
 expect(screen.getByRole('navigation', { name: '개인 페이지' }).getAttribute('translate')).toBe('no');
 fireEvent.click(screen.getByRole('button', { name: '개인 메뉴 닫기' })); expect(screen.queryByRole('dialog')).toBeNull();
});
it('overlays processing photos and removes the dim at readiness', () => {
 const photo = { id: 'image', preview: 'blob:preview', prepareKey: 'a', finalizeKey: 'b', status: 'processing' as const, error: '사진을 확인하고 있어요.' };
 const { rerender } = render(<PhotoPicker photos={[photo]} onChange={() => {}} token="token"/>);
 expect(screen.queryByText('사진을 확인하고 있어요.')).toBeNull(); expect(document.querySelector('.photo-loading')?.textContent).toBe(''); expect(document.querySelector('.photo-loading .loading-spinner')).toBeNull();
 expect(screen.getByRole('progressbar', { name: '사진 준비 중' })).toBeTruthy(); expect(document.querySelector('.photo-preview')?.getAttribute('aria-busy')).toBe('true');
 rerender(<PhotoPicker photos={[{ ...photo, status: 'ready' }]} onChange={() => {}} token="token"/>);
 expect(screen.queryByRole('progressbar')).toBeNull(); expect(document.querySelector('.photo-preview')?.getAttribute('aria-busy')).toBe('false');
 expect(screen.queryByText('준비 완료')).toBeNull();
 rerender(<PhotoPicker photos={[{ ...photo, status: 'preparing' }]} onChange={() => {}} token="token"/>);
 expect(screen.getByRole('progressbar', { name: '사진 준비 중' })).toBeTruthy(); expect(screen.queryByText('사진 줄이는 중')).toBeNull();
 rerender(<PhotoPicker photos={[{ ...photo, status: 'failed', error: '사진 처리 실패' }]} onChange={() => {}} token="token"/>);
 expect(screen.getByText('준비 실패')).toBeTruthy(); expect(screen.getByRole('button', { name: '사진 다시 시도' })).toBeTruthy();
});
it('announces errors in a dismissible toast', () => {
 render(<ToastHost/>); act(() => showToast('사진 준비가 끝난 뒤 제출해 주세요.'));
 expect(screen.getByRole('alert').textContent).toContain('사진 준비가 끝난 뒤'); fireEvent.click(screen.getByRole('button', { name: '알림 닫기' })); expect(screen.queryByRole('alert')).toBeNull();
});
