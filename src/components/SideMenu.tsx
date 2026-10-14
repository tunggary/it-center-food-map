import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
export function SideMenu() {
  const [open, setOpen] = useState(false), dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null), route = useLocation();
  useEffect(() => { setOpen(false); }, [route.pathname]);
  useEffect(() => {
    const node = dialog.current;
    if (open && !node?.open) node?.showModal();
    else if (!open && node?.open) { node.close(); trigger.current?.focus({ preventScroll: true }); }
  }, [open]);
  return <><button ref={trigger} type="button" className="icon-button menu-trigger" aria-label="개인 메뉴 열기" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="menu"/></button>
    <div className="menu-edge" aria-hidden="true" onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={e => { const start = drag.current; drag.current = null; if (start && start.x - e.clientX > 45 && Math.abs(e.clientY - start.y) < 90) setOpen(true); }} onPointerCancel={() => { drag.current = null; }}/>
    <dialog ref={dialog} className="side-menu" aria-labelledby="side-menu-title" onCancel={e => { e.preventDefault(); setOpen(false); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right) setOpen(false); } }}>
      <div className="side-menu-content" onPointerDown={e => { if ((e.target as HTMLElement).closest('a,button')) return; drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={e => { const start = drag.current; drag.current = null; if (start && e.clientX - start.x > 60 && Math.abs(e.clientY - start.y) < 90) setOpen(false); }}><div className="side-menu-heading"><h2 id="side-menu-title">내 메뉴</h2><button autoFocus type="button" className="icon-button" aria-label="개인 메뉴 닫기" onClick={() => setOpen(false)}><Icon name="close"/></button></div><p className="muted">내가 좋아하는 곳과 참여 정보를 관리해요.</p><nav className="notranslate" translate="no" aria-label="개인 페이지"><Link to="/me/favorites"><Icon name="heart"/>내 장소/코스<Icon name="chevron"/></Link><Link to="/me/profile"><Icon name="user"/>내 정보<Icon name="chevron"/></Link></nav><Link className="side-map-link" to="/">지도로 돌아가기</Link></div>
    </dialog></>;
}
