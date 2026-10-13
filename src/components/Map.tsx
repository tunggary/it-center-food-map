import { useEffect, useRef, useState } from 'react';
import type { Pin, Point } from '../../shared/contracts';
import { kakao, loadMap, type KakaoObject } from '../lib/maps';
import { ErrorNotice } from './ui';
const EMPTY_PINS: Pin[] = [];
const EMPTY_POINTS: Point[] = [];
export function MapView({ pins = EMPTY_PINS, points = EMPTY_POINTS, onSelect, onCenter, editing = false, selectedId }: { pins?: Pin[]; points?: Point[]; onSelect?: (id: string) => void; onCenter?: (point: Point) => void; editing?: boolean; selectedId?: string }) {
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<KakaoObject | null>(null);
  const markers = useRef(new Map<string, { marker: KakaoObject; label: KakaoObject; button: HTMLButtonElement; pin: Pin; click: () => void }>());
  const polyline = useRef<KakaoObject | null>(null);
  const callbacks = useRef({ onSelect, onCenter }); callbacks.current = { onSelect, onCenter };
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void loadMap().then(() => {
      if (!active || !element.current) return;
      const sdk = kakao();
      const map = new sdk.Map(element.current, { center: new sdk.LatLng(37.5088, 127.0632), level: editing ? 4 : 5 }); instance.current = map;
      const emitCenter = () => { const p = map.getCenter(); callbacks.current.onCenter?.([p.getLng(), p.getLat()]); };
      sdk.event.addListener(map, 'center_changed', emitCenter); emitCenter();
      setReady(true); setError(undefined);
    }).catch(e => { if (active) setError(e); });
    return () => { active = false; for (const { marker, label, button, click } of markers.current.values()) { kakao().event.removeListener(marker, 'click', click); button.removeEventListener('click', click); marker.setMap(null); label.setMap(null); } markers.current.clear(); polyline.current?.setMap(null); instance.current = null; };
  }, [editing, retry]);
  useEffect(() => {
    if (!ready || !instance.current) return;
    const sdk = kakao(), seen = new Set<string>();
    for (const pin of pins) {
      seen.add(pin.targetId);
      const existing = markers.current.get(pin.targetId);
      if (existing) { existing.marker.setPosition(new sdk.LatLng(pin.lat, pin.lng)); existing.marker.setTitle(`${pin.kind === 'COURSE' ? '산책코스' : '장소'} · ${pin.count}건`); existing.pin = pin; existing.label.setPosition(new sdk.LatLng(pin.lat, pin.lng)); existing.button.textContent = String(pin.count); existing.button.setAttribute('aria-label', `${pin.kind === 'COURSE' ? '산책코스' : '장소'} ${pin.count}건 상세`); }
      else {
        const marker = new sdk.Marker({ map: instance.current, position: new sdk.LatLng(pin.lat, pin.lng), title: `${pin.kind === 'COURSE' ? '산책코스' : '장소'} · ${pin.count}건` });
        const click = () => callbacks.current.onSelect?.(pin.targetId); sdk.event.addListener(marker, 'click', click); const button = document.createElement('button'); button.type = 'button'; button.className = 'pin-count'; button.textContent = String(pin.count); button.setAttribute('aria-label', `${pin.kind === 'COURSE' ? '산책코스' : '장소'} ${pin.count}건 상세`); button.addEventListener('click', click); const label = new sdk.CustomOverlay({ map: instance.current, position: new sdk.LatLng(pin.lat, pin.lng), content: button, yAnchor: 2 }); markers.current.set(pin.targetId, { marker, label, button, pin, click });
      }
    }
    for (const [id, value] of markers.current) if (!seen.has(id)) { sdk.event.removeListener(value.marker, 'click', value.click); value.button.removeEventListener('click', value.click); value.marker.setMap(null); value.label.setMap(null); markers.current.delete(id); }
    if (selectedId) { const pin = markers.current.get(selectedId)?.pin; if (pin) { const position = new sdk.LatLng(pin.lat, pin.lng); if (matchMedia('(prefers-reduced-motion: reduce)').matches) instance.current.setCenter(position); else instance.current.panTo(position); } }
  }, [pins, ready, selectedId]);
  useEffect(() => {
    if (!ready || !instance.current) return;
    const sdk = kakao();
    if (!polyline.current) polyline.current = new sdk.Polyline({ map: instance.current, strokeWeight: 5, strokeColor: '#145c4c', strokeOpacity: .9 });
    polyline.current?.setPath(points.map(([lng, lat]) => new sdk.LatLng(lat, lng)));
    if (!editing && points.length) instance.current.setCenter(new sdk.LatLng(points[0][1], points[0][0]));
  }, [points, ready, editing]);
  return <div className={`map-shell ${editing ? 'editing' : ''}`}><div ref={element} className="map" role="region" aria-label={editing ? '중심점을 움직여 산책 경로를 만드는 지도' : '최애 장소와 코스 지도'}/>{editing ? <span className="crosshair" aria-hidden="true">＋</span> : null}{error ? <div className="map-error"><ErrorNotice error={error} retry={() => { setReady(false); setRetry(v => v + 1); }}/></div> : null}</div>;
}
