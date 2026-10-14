import { useEffect, useRef, useState } from 'react';
import type { Pin, Point } from '../../shared/contracts';
import { kakao, loadMap, type KakaoObject } from '../lib/maps';
import { ErrorNotice } from './ui';
import { showToast } from './Toast';
import { Icon } from './Icon';
export type MapPin = Pin & { name?: string };
const EMPTY_PINS: MapPin[] = [], EMPTY_POINTS: Point[] = [];
export function MapView({ pins = EMPTY_PINS, points = EMPTY_POINTS, onSelect, onCenter, editing = false, selectedId, focusPoint, focusLevel, fullscreen = false, fitPins = false }: { pins?: MapPin[]; points?: Point[]; onSelect?: (id: string) => void; onCenter?: (point: Point) => void; editing?: boolean; selectedId?: string; focusPoint?: Point; focusLevel?: number; fullscreen?: boolean; fitPins?: boolean }) {
  const element = useRef<HTMLDivElement>(null), shell = useRef<HTMLDivElement>(null);
  const instance = useRef<KakaoObject | null>(null);
  const markers = useRef(new Map<string, { marker: KakaoObject; label: KakaoObject; button: HTMLButtonElement; click: () => void }>());
  const userLocation = useRef<KakaoObject | null>(null), alive = useRef(true);
  const [locating, setLocating] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const polyline = useRef<KakaoObject | null>(null);
  const editingRef = useRef(editing); editingRef.current = editing;
  const callbacks = useRef({ onSelect, onCenter }); callbacks.current = { onSelect, onCenter };
  const crosshair = useRef<HTMLSpanElement>(null);
  const selectedPin = pins.find(p => p.targetId === selectedId);
  const selectedLng = focusPoint?.[0] ?? selectedPin?.lng, selectedLat = focusPoint?.[1] ?? selectedPin?.lat;
  const anchor = useRef<Point | undefined>(undefined);
  const reposition = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false), [error, setError] = useState<unknown>(), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, cleanup = () => {};
    setReady(false);
    void loadMap().then(() => {
      if (!active || !element.current) return;
      const sdk = kakao(), map = new sdk.Map(element.current, { center: new sdk.LatLng(37.5088, 127.0632), level: 5 }); instance.current = map;
      const visibleCenter = () => {
        const box = element.current!.getBoundingClientRect();
        let left = 0, top = 0, bottom = box.height;
        const scene = shell.current?.closest('.map-scene');
        if (fullscreen) scene?.querySelectorAll<HTMLElement>('.map-toolbar,.floating-filters,.floating-search').forEach(control => { if (control.getClientRects().length) top = Math.max(top, control.getBoundingClientRect().bottom - box.top + 16); });
        const panel = scene?.querySelector<HTMLElement>('[data-map-panel]:not(.compact-ranking)');
        if (panel) {
          const r = panel.getBoundingClientRect();
          if (matchMedia('(max-width:760px)').matches) bottom = Math.max(top + 40, r.top - box.top);
          else left = r.right - box.left + 20;
        }
        return { x: (left + box.width) / 2, y: (top + bottom) / 2 };
      };
      const emitCenter = () => {
        if (!active || !element.current) return;
        const center = visibleCenter();
        if (crosshair.current) { crosshair.current.style.left = `${center.x}px`; crosshair.current.style.top = `${center.y}px`; }
        const p = fullscreen && editingRef.current ? map.getProjection().coordsFromContainerPoint(new sdk.Point(center.x, center.y)) : map.getCenter();
        callbacks.current.onCenter?.([p.getLng(), p.getLat()]);
      };
      reposition.current = () => {
        if (!active || !element.current) return;
        const box = element.current.getBoundingClientRect();
        map.relayout();
        if (anchor.current) {
          const position = new sdk.LatLng(anchor.current[1], anchor.current[0]);
          const projection = map.getProjection(), px = projection.containerPointFromCoords(position), desired = visibleCenter();
          const center = projection.coordsFromContainerPoint(new sdk.Point(px.x + box.width / 2 - desired.x, px.y + box.height / 2 - desired.y));
          map.setCenter(center);
        }
        emitCenter();
      };
      sdk.event.addListener(map, 'center_changed', emitCenter);
      sdk.event.addListener(map, 'zoom_changed', emitCenter);
      const observer = new ResizeObserver(() => reposition.current());
      observer.observe(element.current);
      const scene = shell.current?.closest('.map-scene');
      const observePanel = () => { observer.disconnect(); if (element.current) observer.observe(element.current); scene?.querySelectorAll('[data-map-panel]').forEach(p => observer.observe(p)); reposition.current(); };
      const mutation = new MutationObserver(observePanel);
      if (scene) mutation.observe(scene, { childList: true });
      observePanel(); setReady(true); setError(undefined);
      cleanup = () => { observer.disconnect(); mutation.disconnect(); sdk.event.removeListener(map, 'center_changed', emitCenter); sdk.event.removeListener(map, 'zoom_changed', emitCenter); };
    }).catch(e => { if (active) setError(e); });
    return () => { active = false; cleanup(); if (instance.current) { for (const { marker, label, button, click } of markers.current.values()) { kakao().event.removeListener(marker, 'click', click); button.removeEventListener('click', click); marker.setMap(null); label.setMap(null); } polyline.current?.setMap(null); userLocation.current?.setMap(null); userLocation.current = null; } markers.current.clear(); polyline.current = null; instance.current = null; reposition.current = () => {}; };
  }, [retry, fullscreen]);
  // Switching between browsing and course input must preserve the existing map.
  useEffect(() => { anchor.current = selectedLng !== undefined && selectedLat !== undefined ? [selectedLng, selectedLat] : undefined; reposition.current(); }, [selectedLng, selectedLat]);
  useEffect(() => { reposition.current(); }, [editing, ready]);
  useEffect(() => {
    if (!ready || !instance.current || focusLevel === undefined || selectedLng === undefined || selectedLat === undefined) return;
    instance.current.setLevel(Math.min(instance.current.getLevel(), focusLevel));
    reposition.current();
  }, [ready, focusLevel, selectedLng, selectedLat]);
  const pinBoundsKey = pins.map(p => `${p.lng},${p.lat}`).join(';');
  useEffect(() => {
    if (!fitPins || !ready || !instance.current || !pins.length) return;
    const sdk = kakao(), bounds = new sdk.LatLngBounds();
    pins.forEach(pin => bounds.extend(new sdk.LatLng(pin.lat, pin.lng)));
    const panel = shell.current?.closest('.map-scene')?.querySelector<HTMLElement>('[data-map-panel]');
    const mobile = matchMedia('(max-width:760px)').matches;
    instance.current.setBounds(bounds, 150, 70, mobile ? (panel?.offsetHeight ?? 0) + 30 : 70, mobile ? 35 : (panel?.offsetWidth ?? 0) + 55);
  }, [fitPins, ready, pinBoundsKey]);
  useEffect(() => {
    if (!ready || !instance.current) return;
    const sdk = kakao(), seen = new Set<string>();
    for (const pin of pins) {
      seen.add(pin.targetId);
      const text = pin.name ?? `${pin.kind === 'COURSE' ? '코스' : '장소'} · ${pin.count}건`;
      const position = new sdk.LatLng(pin.lat, pin.lng);
      let value = markers.current.get(pin.targetId);
      if (!value) {
        const marker = new sdk.Marker({ map: instance.current, position, title: text });
        const click = () => callbacks.current.onSelect?.(pin.targetId);
        sdk.event.addListener(marker, 'click', click);
        const button = document.createElement('button'); button.type = 'button'; button.addEventListener('click', click);
        const label = new sdk.CustomOverlay({ map: instance.current, position, content: button, yAnchor: 1.2 });
        value = { marker, label, button, click }; markers.current.set(pin.targetId, value);
      }
      value.marker.setPosition(position); value.marker.setTitle(text); value.label.setPosition(position);
      const labelText = pin.name ? `${pin.name}${pin.count ? ` · ${pin.count}` : ''}` : text;
      const labelClass = `pin-count ${pin.targetId === selectedId ? 'selected' : ''}`;
      const changed = value.button.textContent !== labelText || value.button.className !== labelClass;
      value.button.textContent = labelText; value.button.className = labelClass;
      if (changed) value.label.setContent(value.button);
      value.button.setAttribute('aria-label', `${text} 선택`); value.button.setAttribute('aria-pressed', String(pin.targetId === selectedId));
      value.label.setZIndex(pin.targetId === selectedId ? 5 : 1);
    }
    for (const [id, value] of markers.current) if (!seen.has(id)) { sdk.event.removeListener(value.marker, 'click', value.click); value.button.removeEventListener('click', value.click); value.marker.setMap(null); value.label.setMap(null); markers.current.delete(id); }
  }, [pins, ready, selectedId]);
  useEffect(() => {
    if (!ready || !instance.current) return;
    const sdk = kakao();
    if (!polyline.current) polyline.current = new sdk.Polyline({ map: instance.current, strokeWeight: 5, strokeColor: '#176c51', strokeOpacity: .9 });
    polyline.current?.setPath(points.map(([lng, lat]) => new sdk.LatLng(lat, lng)));
    if (!fullscreen && !editing && points.length) instance.current.setCenter(new sdk.LatLng(points[0][1], points[0][0]));
  }, [points, ready, editing, fullscreen]);
  const locate = () => {
    if (!navigator.geolocation) { showToast('이 브라우저에서는 위치를 확인할 수 없어요.'); return; }
    if (!instance.current || locating) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive.current || !instance.current) return;
      setLocating(false);
      const sdk = kakao(), point = new sdk.LatLng(position.coords.latitude, position.coords.longitude);
      if (!userLocation.current) {
        const dot = document.createElement('span'); dot.className = 'user-location-dot'; dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', '내 현재 위치');
        userLocation.current = new sdk.CustomOverlay({ map: instance.current, position: point, content: dot, xAnchor: .5, yAnchor: .5, zIndex: 10 });
      } else userLocation.current.setPosition(point);
      instance.current.setCenter(point);
      anchor.current = [position.coords.longitude, position.coords.latitude];
      reposition.current();
      showToast('내 위치로 이동했어요.', 'success');
    }, failure => {
      if (!alive.current) return;
      setLocating(false);
      showToast(failure.code === 1 ? '위치 권한을 허용해 주세요. 브라우저 설정에서 위치 접근을 변경할 수 있어요.' : failure.code === 3 ? '위치를 확인하는 데 시간이 걸려요. 다시 시도해 주세요.' : '현재 위치를 확인하지 못했어요. 위치 서비스를 켜고 다시 시도해 주세요.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  };
  const zoom = (delta: number) => { if (instance.current) instance.current.setLevel(Math.min(12, Math.max(1, instance.current.getLevel() + delta))); };
  return <div ref={shell} className={`map-shell ${fullscreen ? 'full-map' : ''} ${editing ? 'editing' : ''}`}><div ref={element} className="map" role="region" aria-label={editing ? '중심점을 움직여 산책 경로를 만드는 지도' : '최애 장소와 코스 지도'}/>{editing ? <span ref={crosshair} className="crosshair" aria-hidden="true">＋</span> : null}{fullscreen ? <div className="map-tools"><div className="map-tool-group"><button className="icon-button" type="button" aria-label="지도 확대" onClick={() => zoom(-1)}><Icon name="plus"/></button><button className="icon-button" type="button" aria-label="지도 축소" onClick={() => zoom(1)}><Icon name="minus"/></button></div><button className="icon-button map-tool-group" type="button" aria-label="내 위치" disabled={!ready || locating} aria-busy={locating} onClick={locate}><Icon name="locate"/></button></div> : null}{error ? <div className="map-error"><ErrorNotice error={error} retry={() => setRetry(v => v + 1)}/></div> : null}</div>;
}
