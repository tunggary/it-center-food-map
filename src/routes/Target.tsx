import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Participant, TargetDetail } from '../../shared/contracts';
import { edge, photoUrl, rpc, ApiError } from '../lib/api';
import { storedToken } from '../lib/identity';
import { useCatalog } from '../lib/state';
import { Empty, ErrorNotice, FiltersForm, Loading, Page, useFilters } from '../components/ui';
import { MapView } from '../components/Map';
export default function TargetPage() {
  const { id } = useParams();
  const location = useLocation();
  const [filters, changeFilters, query] = useFilters();
  const catalog = useCatalog();
  const [cursor, setCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const token = storedToken();
  const me = useQuery({ queryKey: ['me', token], enabled: !!token, queryFn: () => edge<Participant | null>('/me', { token: token! }) });
  const detail = useQuery({ queryKey: ['target', id, all ? null : filters.teamId, all ? null : filters.categoryId, cursor], queryFn: ({ signal }) => rpc<TargetDetail>('read_target', { p_target_id: id, p_team_id: all ? null : filters.teamId, p_category_id: all ? null : filters.categoryId, p_cursor: cursor, p_expected_revision: cursor ? revision : null }, signal) });
  useEffect(() => { if (detail.error instanceof ApiError && detail.error.code === 'SNAPSHOT_CHANGED') { setCursor(null); setRevision(null); } }, [detail.error]);
  useEffect(() => { setCursor(null); setRevision(null); }, [id, filters.teamId, filters.categoryId, all]);
  const mine = useQuery({ queryKey: ['mine-target', token, id], enabled: !!token && !!me.data, queryFn: async () => { let next: string | null = null; do { const response: { favorites: import('../../shared/contracts').Favorite[]; nextCursor: string | null } = await edge(`/me/favorites${next ? `?cursor=${encodeURIComponent(next)}` : ''}`, { token: token! }); const found = response.favorites.find(f => f.targetId === id); if (found) return found; next = response.nextCursor; } while (next); return null; } });
  const own = mine.data ?? detail.data?.favorites.find(f => f.participantId === me.data?.id);
  return <Page title={detail.data?.target.name ?? '최애 상세'}>{(location.state as { completed?: boolean } | null)?.completed ? <p role="status" className="notice">최애 등록 결과를 확인했어요.</p> : null}{detail.isPending ? <Loading/> : null}{detail.error ? <ErrorNotice error={detail.error} retry={() => void detail.refetch()}/> : null}{detail.data ? <><p className="muted">{detail.data.target.address ?? '함께 걷는 산책코스'}</p>{detail.data.target.kind === 'COURSE' ? <><MapView points={detail.data.target.points ?? []}/><p>참고 선 거리 {Math.round(detail.data.target.approximateLengthM ?? 0).toLocaleString()}m</p></> : null}<div className="actions"><span>이 조건 {detail.data.filteredCount}건 · 전체 {detail.data.totalCount}건</span><button onClick={() => { setCursor(null); setAll(v => !v); }}>{all ? '원래 조건 보기' : '전체 등록 보기'}</button></div>{catalog.data && !all ? <FiltersForm catalog={catalog.data} filters={filters} onChange={changeFilters}/> : null}{!detail.data.favorites.length ? <Empty>이 조건에 등록된 문구가 아직 없어요.</Empty> : <div className="favorites">{detail.data.favorites.map(f => <article key={f.id} className="favorite"><header><strong>{f.nickname}</strong><span>{f.teamName} · {f.categoryName}</span></header><p className="message">{f.message}</p>{f.photos.length ? <div className="photos">{f.photos.map(p => <a key={p.assetId} href={photoUrl(p.assetId, 'full')} target="_blank" rel="noreferrer"><img src={photoUrl(p.assetId)} alt={`${f.nickname}의 최애 사진 ${p.slot}`} loading="lazy" onError={e => { e.currentTarget.hidden = true; }}/></a>)}</div> : null}{f.participantId === me.data?.id ? <Link to={`/register?favorite=${f.id}`} state={{ favorite: f }}>내 등록 수정하기</Link> : null}</article>)}</div>}{detail.data.nextCursor ? <button onClick={() => { setRevision(detail.data!.revision); setCursor(detail.data!.nextCursor); }}>다음 20건 보기</button> : null}{cursor ? <button onClick={() => setCursor(null)}>처음으로</button> : null}<div className="actions"><Link className="button primary" to={own ? `/register?favorite=${own.id}` : `/register?target=${id}&return=${encodeURIComponent(query)}`} state={own ? { favorite: own } : { target: detail.data.target }}> {own ? '내 등록 관리' : '나도 최애로 등록'}</Link><Link to={`/rankings${query ? `?${query}` : ''}`}>랭킹으로 돌아가기</Link></div></> : null}</Page>;
}
