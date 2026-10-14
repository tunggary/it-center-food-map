import { createContext, useContext, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Target } from '../../shared/contracts';
import { MapView } from './Map';
import { useMobileScreen } from '../lib/viewport';
import { SideMenu } from './SideMenu';
import { RegistrationLink } from './Registration';
import { Icon } from './Icon';
const GeometryContext = createContext<(target: Target | undefined) => void>(() => {});
export const useMapGeometry = () => useContext(GeometryContext);
export function MapScene({ children, className = '', ...map }: ComponentProps<typeof MapView> & { children: ReactNode; className?: string }) {
  const [target, setTarget] = useState<Target>();
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => { root.current?.style.setProperty('--viewport-height', `${viewport?.height ?? window.innerHeight}px`); root.current?.style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`); };
    resize(); viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize);
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); };
  }, []);
  const pins = target ? [...(map.pins ?? []).filter(p => p.targetId !== target.id), { targetId: target.id, kind: target.kind, lng: target.lng, lat: target.lat, count: map.pins?.find(p => p.targetId === target.id)?.count ?? 0, name: target.name }] : map.pins;
  return <GeometryContext.Provider value={setTarget}><section ref={root} className={`map-scene ${className}`}><MapView fullscreen {...map} pins={pins} focusPoint={target ? [target.lng, target.lat] : map.focusPoint} points={target?.kind === 'COURSE' ? target.points ?? [] : map.points} selectedId={target?.id ?? map.selectedId}/>{children}</section></GeometryContext.Provider>;
}
export function MapToolbar({ booth = false, hideMobileMenu = false }: { booth?: boolean; hideMobileMenu?: boolean }) {
  const mobile = useMobileScreen();
  if (mobile && hideMobileMenu && !booth) return null;
  return <header className="map-toolbar">{booth ? <span className="live-badge"><i/>실시간으로 모이는 중</span> : mobile ? <SideMenu/> : <nav className="personal-menu notranslate" translate="no" aria-label="개인 메뉴"><Link to="/me/favorites"><Icon name="heart"/><span>내 장소/코스</span></Link><Link to="/me/profile"><Icon name="user"/><span>내 정보</span></Link></nav>}</header>;
}
export function usePanelClose(fallback: string) {
  const navigate = useNavigate();
  return () => { const [path, search = ''] = fallback.split('?'); const params = new URLSearchParams(search); params.delete('rankPage'); navigate(`${path}${params.size ? `?${params}` : ''}`, { replace: true }); };
}
export function MapPanel({ title, eyebrow, children, footer, onClose, className = '', initialSize = 'middle', contentKey }: { title: string; eyebrow?: string; children: ReactNode; footer?: ReactNode; onClose?: () => void; className?: string; initialSize?: 'middle' | 'expanded' | 'summary' | 'detail'; contentKey?: string }) {
  const [size, setSize] = useState(initialSize);
  const ref = useRef<HTMLElement>(null), handle = useRef<HTMLButtonElement>(null);
  const ignoreClick = useRef(false);
  const drag = useRef<{ y: number; height: number; current: number } | null>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[data-panel-title]')?.focus({ preventScroll: true }));
    return () => { cancelAnimationFrame(frame); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { setSize(initialSize); if (ref.current) { const content = ref.current.querySelector<HTMLElement>('.panel-content'); if (content) content.scrollTop = 0; } }, [initialSize, contentKey]);
  const cycle = () => setSize(v => v === 'middle' || v === 'detail' ? 'expanded' : v === 'expanded' ? 'summary' : initialSize === 'detail' ? 'detail' : 'middle');
  const finishDrag = () => {
    if (!drag.current || !ref.current) return;
    const ratio = drag.current.current / (window.visualViewport?.height ?? window.innerHeight);
    ref.current.style.removeProperty('--drag-height'); ref.current.classList.remove('dragging'); drag.current = null;
    setSize(ratio > .76 ? 'expanded' : ratio < .4 ? 'summary' : initialSize === 'detail' ? 'detail' : 'middle');
  };
  return <section ref={ref} className={`map-panel size-${size} ${className}`} data-map-panel aria-labelledby={titleId} onKeyDown={e => { if (e.key === 'Escape' && onClose && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.stopPropagation(); onClose(); } }}>
    <button ref={handle} className="sheet-handle" type="button" aria-label="시트 높이 조절" onClick={() => { if (ignoreClick.current) { ignoreClick.current = false; return; } cycle(); }} onPointerDown={e => { if (!matchMedia('(max-width: 760px)').matches || !ref.current) return; drag.current = { y: e.clientY, height: ref.current.getBoundingClientRect().height, current: ref.current.getBoundingClientRect().height }; ref.current.classList.add('dragging'); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (!drag.current || !ref.current) return; const h = window.visualViewport?.height ?? window.innerHeight; drag.current.current = Math.max(h * .28, Math.min(h * .9, drag.current.height + drag.current.y - e.clientY)); ref.current.style.setProperty('--drag-height', `${drag.current.current}px`); }} onPointerUp={e => { if (drag.current && Math.abs(e.clientY - drag.current.y) > 4) { ignoreClick.current = true; finishDrag(); e.preventDefault(); } else { drag.current = null; ref.current?.classList.remove('dragging'); } }} onPointerCancel={finishDrag}><span/></button>
    <div className="panel-heading">{eyebrow ? <p className="eyebrow notranslate" translate="no">{eyebrow}</p> : null}<div className="panel-title-row"><h1 id={titleId} data-panel-title tabIndex={-1}>{title}</h1><div className="panel-heading-actions"><button className="icon-button sheet-expand" type="button" onClick={cycle} aria-label={size === 'expanded' ? '시트 줄이기' : '시트 펼치기'}><Icon name="expand"/></button>{onClose ? <button className="icon-button" type="button" onClick={onClose} aria-label="패널 닫기"><Icon name="close"/></button> : null}</div></div></div>
    <div className="panel-content">{children}</div>{footer ? <footer className="panel-footer">{footer}</footer> : null}
  </section>;
}
export function MapMessages({ children }: { children: ReactNode }) { return <div className="map-messages">{children}</div>; }
export function FloatingRegister({ query = '' }: { query?: string }) { return <div className="floating-register"><RegistrationLink className="button primary" to={`/register${query ? `?return=${encodeURIComponent(query)}` : ''}`}><Icon name="plus"/>최애 등록하기</RegistrationLink></div>; }
