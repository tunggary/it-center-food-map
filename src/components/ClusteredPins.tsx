import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Pin } from '../../shared/contracts';
import { kakao, type KakaoObject } from '../lib/maps';
import { clusterLabel, clusterPins, type PinCluster } from '../lib/map-clusters';
import { Icon } from './Icon';

type Entry = { marker: KakaoObject; label: KakaoObject; button: HTMLButtonElement; click: () => void; group: PinCluster };
type Popup = { key: string; pins: Pin[]; x: number; y: number };
export function ClusteredPins({ map, pins, selectedId, onSelect, contextKey }: { map: KakaoObject; pins: Pin[]; selectedId?: string; onSelect?: (id: string) => void; contextKey?: string }) {
  const host = useRef<HTMLDivElement>(null), popupRef = useRef<HTMLDivElement>(null);
  const entries = useRef(new Map<string, Entry>());
  const latest = useRef({ pins, selectedId, onSelect }); latest.current = { pins, selectedId, onSelect };
  const redraw = useRef(() => {});
  const [popup, setPopup] = useState<Popup | null>(null);
  const close = (restore = false) => { if (restore && popup) entries.current.get(popup.key)?.button.focus({ preventScroll: true }); setPopup(null); };
  useEffect(() => { setPopup(null); }, [contextKey, selectedId]);
  useEffect(() => {
    const sdk = kakao(), shell = host.current!.parentElement!;
    const measureHost = document.createElement('div'); measureHost.className = 'cluster-measure'; measureHost.setAttribute('aria-hidden', 'true'); measureHost.inert = true; shell.append(measureHost);
    let frame = 0, sizes = new Map<string, { width: number; height: number }>();
    const remove = (entry: Entry) => { sdk.event.removeListener(entry.marker, 'click', entry.click); entry.button.removeEventListener('click', entry.click); entry.marker.setMap(null); entry.label.setMap(null); };
    const draw = () => {
      const { pins: current, selectedId: selected } = latest.current;
      const labels = current.map(pin => `${pin.name}${pin.count ? ` · ${pin.count}` : ''}`);
      const missing = [...new Set(labels)].filter(text => !sizes.has(text));
      const probes = missing.map(text => { const button = document.createElement('button'); button.className = 'pin-count cluster-pin-label'; button.textContent = text; return button; });
      measureHost.replaceChildren(...probes);
      probes.forEach((button, i) => { const box = button.getBoundingClientRect(); sizes.set(missing[i], { width: box.width, height: box.height }); });
      const measureGroup = (count: number) => {
        const text = clusterLabel(count);
        if (!sizes.has(text)) { const button = document.createElement('button'); button.className = 'pin-count cluster-pin-label pin-cluster'; button.textContent = text; measureHost.replaceChildren(button); const box = button.getBoundingClientRect(); sizes.set(text, { width: box.width, height: box.height }); }
        return sizes.get(text)!;
      };
      const projection = map.getProjection();
      const groups = clusterPins(current.map((pin, i) => { const point = projection.containerPointFromCoords(new sdk.LatLng(pin.lat, pin.lng)); return { id: pin.targetId, x: point.x, y: point.y, ...sizes.get(labels[i])! }; }), measureGroup, selected);
      const byId = new Map(current.map(pin => [pin.targetId, pin]));
      const seen = new Set<string>();
      for (const group of groups) {
        const key = JSON.stringify(group.ids), multiple = group.ids.length > 1;
        seen.add(key);
        const pin = byId.get(group.ids[0])!;
        const text = multiple ? clusterLabel(group.ids.length) : `${pin.name}${pin.count ? ` · ${pin.count}` : ''}`;
        const position = multiple ? projection.coordsFromContainerPoint(new sdk.Point(group.x, group.y)) : new sdk.LatLng(pin.lat, pin.lng);
        let entry = entries.current.get(key);
        if (!entry) {
          const button = document.createElement('button'); button.type = 'button';
          const marker = new sdk.Marker({ map, position });
          const label = new sdk.CustomOverlay({ map, position, content: button, yAnchor: 1.2 });
          const click = () => {
            sdk.event.preventMap();
            if (!multiple) { setPopup(null); latest.current.onSelect?.(group.ids[0]); return; }
            const activeGroup = entries.current.get(key)!.group;
            const ids = new Set(activeGroup.ids);
            setPopup(previous => previous?.key === key ? null : { key, pins: latest.current.pins.filter(p => ids.has(p.targetId)), x: activeGroup.x, y: activeGroup.y });
          };
          button.addEventListener('click', click); sdk.event.addListener(marker, 'click', click);
          entry = { button, marker, label, click, group }; entries.current.set(key, entry);
        }
        entry.group = group;
        entry.marker.setPosition(position); entry.marker.setTitle(text); entry.label.setPosition(position);
        entry.marker.setZIndex(group.ids.includes(selected ?? '') ? 5 : 1);
        entry.button.textContent = text;
        entry.button.className = `pin-count cluster-pin-label${multiple ? ' pin-cluster' : ''}${group.ids.includes(selected ?? '') ? ' selected' : ''}`;
        entry.button.setAttribute('aria-label', multiple ? `${text} 목록 열기` : `${pin.name} 선택`);
        entry.button.setAttribute('aria-pressed', String(group.ids.includes(selected ?? '')));
        if (multiple) entry.button.setAttribute('aria-haspopup', 'dialog');
        entry.label.setContent(entry.button); entry.label.setZIndex(group.ids.includes(selected ?? '') ? 5 : 1);
      }
      for (const [key, entry] of entries.current) if (!seen.has(key)) { remove(entry); entries.current.delete(key); }
      setPopup(previous => {
        if (!previous) return null;
        const entry = entries.current.get(previous.key);
        return entry ? { key: previous.key, pins: entry.group.ids.map(id => byId.get(id)!), x: entry.group.x, y: entry.group.y } : null;
      });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    const dismiss = () => setPopup(null);
    const resize = new ResizeObserver(() => { sizes = new Map(); schedule(); }); resize.observe(shell);
    const scene = shell.closest('.map-scene');
    const observePanels = () => { scene?.querySelectorAll<HTMLElement>('[data-map-panel],.map-toolbar,.ranking-ticker,.floating-filters,.booth-announcement,.floating-register,.map-tools').forEach(el => resize.observe(el)); schedule(); };
    const panels = new MutationObserver(observePanels); if (scene) panels.observe(scene, { childList: true }); observePanels();
    sdk.event.addListener(map, 'idle', schedule);
    for (const event of ['dragstart', 'zoom_start', 'center_changed', 'click']) sdk.event.addListener(map, event, dismiss);
    let active = true; void document.fonts?.ready.then(() => { if (active) { sizes.clear(); schedule(); } });
    redraw.current = schedule; schedule();
    return () => { active = false; cancelAnimationFrame(frame); redraw.current = () => {}; resize.disconnect(); panels.disconnect(); sdk.event.removeListener(map, 'idle', schedule); for (const event of ['dragstart', 'zoom_start', 'center_changed', 'click']) sdk.event.removeListener(map, event, dismiss); entries.current.forEach(remove); entries.current.clear(); measureHost.remove(); };
  }, [map]);
  useEffect(() => { redraw.current(); }, [pins, selectedId]);
  useLayoutEffect(() => {
    if (!popup || !popupRef.current || !host.current) return;
    const element = popupRef.current, shell = host.current.parentElement!, box = shell.getBoundingClientRect();
    // Partition available map space around panels/controls so the popup cannot cover them.
    let regions = [{ left: 12, top: 12, right: box.width - 12, bottom: box.height - 12 }];
    shell.closest('.map-scene')?.querySelectorAll<HTMLElement>('[data-map-panel],.map-toolbar,.ranking-ticker,.floating-filters,.floating-search,.floating-register,.map-tools,.booth-announcement,.booth-title').forEach(control => {
      if (!control.getClientRects().length) return;
      const r = control.getBoundingClientRect(), obstacle = { left: r.left - box.left - 8, right: r.right - box.left + 8, top: r.top - box.top - 8, bottom: r.bottom - box.top + 8 };
      regions = regions.flatMap(area => {
        const left = Math.max(area.left, obstacle.left), right = Math.min(area.right, obstacle.right), top = Math.max(area.top, obstacle.top), bottom = Math.min(area.bottom, obstacle.bottom);
        if (left >= right || top >= bottom) return [area];
        return [{ ...area, bottom: top }, { ...area, top: bottom }, { left: area.left, right: left, top, bottom }, { left: right, right: area.right, top, bottom }].filter(a => a.right - a.left >= 180 && a.bottom - a.top >= 88);
      });
    });
    const region = regions.sort((a, b) => {
      const score = (r: typeof a) => Math.hypot(Math.max(r.left - popup.x, 0, popup.x - r.right), Math.max(r.top - popup.y, 0, popup.y - r.bottom)) + Math.max(0, 240 - (r.right - r.left)) * 2 + Math.max(0, 260 - (r.bottom - r.top)) * 2;
      return score(a) - score(b);
    })[0];
    if (!region) { element.style.visibility = 'hidden'; return; }
    element.style.visibility = '';
    element.style.width = `${Math.min(280, region.right - region.left)}px`;
    element.style.maxHeight = `${Math.min(348, region.bottom - region.top)}px`;
    const size = element.getBoundingClientRect();
    element.style.left = `${Math.max(region.left, Math.min(popup.x - size.width / 2, region.right - size.width))}px`;
    element.style.top = `${Math.max(region.top, Math.min(popup.y + 12, region.bottom - size.height))}px`;
  }, [popup]);
  useEffect(() => { if (popup) popupRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }, [popup?.key]);
  return <div ref={host} className="cluster-layer">{popup ? <div ref={popupRef} className="cluster-popup" role="dialog" aria-label={clusterLabel(popup.pins.length)} onMouseDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(true); } }}>
    <header><strong>{clusterLabel(popup.pins.length)}</strong><button type="button" className="icon-button" aria-label="묶음 목록 닫기" onClick={() => close(true)}><Icon name="close"/></button></header>
    <ul>{[...popup.pins].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko') || a.targetId.localeCompare(b.targetId)).map(pin => <li key={pin.targetId}><button type="button" aria-current={pin.targetId === selectedId ? 'true' : undefined} onClick={() => { close(); onSelect?.(pin.targetId); }}><span><strong>{pin.name}</strong><small>{pin.kind === 'COURSE' ? '산책코스' : '장소'}</small></span><span className="cluster-count">최애 {pin.count}</span><Icon name="chevron"/></button></li>)}</ul>
  </div> : null}</div>;
}
