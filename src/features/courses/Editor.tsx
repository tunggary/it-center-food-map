import { useState } from 'react';
import type { Point } from '../../../shared/contracts';
import { points as pointsSchema, text } from '../../../shared/validation';
import { MapView } from '../../components/Map';
export function approximateDistance(points: Point[]) {
  let distance = 0;
  for (let i = 1; i < points.length; i++) { const [x1, y1] = points[i - 1], [x2, y2] = points[i]; const rad = Math.PI / 180; const a = Math.sin((y2 - y1) * rad / 2) ** 2 + Math.cos(y1 * rad) * Math.cos(y2 * rad) * Math.sin((x2 - x1) * rad / 2) ** 2; distance += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
  return Math.round(distance);
}
export function CourseEditor({ name, points, onChange, onComplete, mapCenter }: { name: string; points: Point[]; onChange: (name: string, points: Point[]) => void; onComplete?: () => void; mapCenter?: Point }) {
  const [center, setCenter] = useState<Point>([127.0632, 37.5088]);
  const [error, setError] = useState('');
  return <div className="course-editor"><label>코스 이름<input value={name} onChange={e => onChange(e.target.value, points)} placeholder="함께 걷고 싶은 길" /></label>{mapCenter ? null : <MapView editing points={points} onCenter={setCenter}/>}<p>{points.length}/200개 점 · 참고 선 거리 {approximateDistance(points).toLocaleString()}m</p><p className="muted">지도 중심의 ＋ 위치에 점을 추가해 주세요. 실제 도보 길찾기나 예상 시간이 아니에요.</p><div className="actions"><button type="button" disabled={points.length >= 200} onClick={() => onChange(name, [...points, mapCenter ?? center])}>점 추가</button><button type="button" disabled={!points.length} onClick={() => onChange(name, points.slice(0, -1))}>마지막 점 취소</button>{onComplete ? <button type="button" className="primary" onClick={() => { const n = text(50).safeParse(name), p = pointsSchema.safeParse(points); if (!n.success || !p.success) setError('이름 1~50자와 서로 다른 점 2~200개를 준비해 주세요.'); else { setError(''); onComplete(); } }}>경로 완료</button> : null}</div>{error ? <p role="alert" className="error">{error}</p> : null}</div>;
}
