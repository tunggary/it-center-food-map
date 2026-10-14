import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Favorite, Participant, TargetDetail } from '../../shared/contracts';
import { edge, photoUrl, rpc, ApiError } from '../lib/api';
import { storedToken } from '../lib/identity';
import { Empty, ErrorNotice, Loading, useFilters } from '../components/ui';
import { MapPanel, useMapGeometry, usePanelClose } from '../components/MapScene';
import { Icon } from '../components/Icon';
import { useCatalog } from '../lib/state';
import { rankingHomeQuery } from '../lib/ranking';
export function TargetContent({ id, onClose }: { id: string; onClose: () => void }) {
  const location = useLocation(), [, , query] = useFilters();
  const token = storedToken(), setGeometry = useMapGeometry(), client = useQueryClient();
  const me = useQuery({ queryKey: ['me', token], enabled: !!token, queryFn: () => edge<Participant | null>('/me', { token: token! }) });
  const detailKey = ['target-pages', id, null, null];
  const detail = useInfiniteQuery({ queryKey: detailKey, initialPageParam: null as { cursor: string; revision: string } | null, queryFn: ({ pageParam, signal }) => rpc<TargetDetail>('read_target', { p_target_id: id, p_team_id: null, p_category_id: null, p_cursor: pageParam?.cursor ?? null, p_expected_revision: pageParam?.revision ?? null }, signal), getNextPageParam: (last, pages) => last.nextCursor ? { cursor: last.nextCursor, revision: pages[0].revision } : undefined, maxPages: 0 });
  const first = detail.data?.pages[0];
  useEffect(() => { setGeometry(first?.target); return () => setGeometry(undefined); }, [first?.target, setGeometry]);
  const mine = useQuery({ queryKey: ['mine-target', token, id], enabled: !!token && !!me.data, queryFn: async () => { let next: string | null = null; do { const response: { favorites: Favorite[]; nextCursor: string | null } = await edge(`/me/favorites${next ? `?cursor=${encodeURIComponent(next)}` : ''}`, { token: token! }); const found = response.favorites.find(f => f.targetId === id); if (found) return found; next = response.nextCursor; } while (next); return null; } });
  const favorites = detail.data?.pages.flatMap(p => p.favorites) ?? [];
  const own = mine.data ?? favorites.find(f => f.participantId === me.data?.id);
  const registrationUrl = (favoriteId?: string) => {
    const params = new URLSearchParams({ target: id, from: 'detail' });
    if (favoriteId) params.set('favorite', favoriteId);
    if (query) params.set('return', query);
    return `/register?${params}`;
  };
  const restart = () => { void client.resetQueries({ queryKey: detailKey, exact: true }); };
  useEffect(() => { if (detail.error instanceof ApiError && detail.error.code === 'SNAPSHOT_CHANGED') void client.resetQueries({ queryKey: detailKey, exact: true }); }, [detail.error, client]);
  return <MapPanel contentKey={id} initialSize="detail" title={first?.target.name ?? '최애 상세'} eyebrow={first?.target.kind === 'COURSE' ? 'WALKING COURSE' : 'OUR FAVORITE PLACE'} onClose={onClose} footer={first ? <Link className="button primary" to={registrationUrl(own?.id)} state={own ? { favorite: own } : { target: first.target }}><Icon name="heart"/>{own ? '내 등록 관리' : '나도 최애로 등록'}</Link> : null}>{(location.state as { completed?: boolean } | null)?.completed ? <p role="status" className="notice success">최애 등록 결과를 확인했어요.</p> : null}{detail.isPending ? <Loading/> : null}{detail.error ? <ErrorNotice error={detail.error} retry={restart}/> : null}{first ? <><p className="target-address">{first.target.address ?? '함께 걷는 산책코스'}</p>{first.target.kind === 'COURSE' ? <p className="muted">참고 선 거리 {Math.round(first.target.approximateLengthM ?? 0).toLocaleString()}m</p> : null}<div className="detail-stats"><span><Icon name="heart"/><strong>{first.totalCount}명</strong>의 최애</span></div><div className="detail-section-heading"><h2>동료들의 최애</h2></div>{!favorites.length ? <Empty>등록된 문구가 아직 없어요.</Empty> : <div className="comments">{favorites.map(f => <article key={f.id} className="comment"><header><span className="avatar" aria-hidden="true">{f.nickname.slice(0, 1)}</span><span><strong>{f.nickname}</strong><small>{f.teamName} · {f.categoryName}</small></span></header><p className="message">{f.message}</p>{f.photos.length ? <div className="photos">{f.photos.map(p => <a key={p.assetId} href={photoUrl(p.assetId, 'full')} target="_blank" rel="noreferrer"><img src={photoUrl(p.assetId)} alt={`${f.nickname}의 최애 사진 ${p.slot}`} loading="lazy" onError={e => { e.currentTarget.hidden = true; }}/></a>)}</div> : null}<small>{new Date(f.createdAt).toLocaleDateString('ko')}</small>{f.participantId === me.data?.id ? <Link className="text-link" to={registrationUrl(f.id)} state={{ favorite: f }}>내 등록 수정하기</Link> : null}</article>)}</div>}{detail.hasNextPage ? <button className="load-more" disabled={detail.isFetchingNextPage} onClick={() => void detail.fetchNextPage()}>{detail.isFetchingNextPage ? '불러오는 중…' : '최애 더 보기'}</button> : null}<Link className="text-link" to={`/rankings${query ? `?${query}` : ''}`} replace>전체 랭킹 보기 <Icon name="chevron"/></Link></> : null}</MapPanel>;
}
export default function TargetPage() { const { id } = useParams(); const route = useLocation(); const catalog = useCatalog(); const close = usePanelClose(`/?${rankingHomeQuery(new URLSearchParams(route.search), catalog.data)}`); return <TargetContent id={id!} onClose={close}/>; }
