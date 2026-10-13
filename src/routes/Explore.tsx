import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Explore, Ranking } from '../../shared/contracts';
import { rpc } from '../lib/api';
import { useCatalog } from '../lib/state';
import { MapView } from '../components/Map';
import { Empty, ErrorNotice, FiltersForm, Loading, useFilters } from '../components/ui';
export function RankingList({ items, query = '' }: { items: Ranking[]; query?: string }) {
  return <ol className="rankings">{items.map(item => <li key={item.targetId}><Link to={`/targets/${item.targetId}${query ? `?${query}` : ''}`}><span className="rank">{item.rank}</span><span><strong>{item.name}</strong><small>{item.kind === 'COURSE' ? '산책코스' : '장소'}</small></span><b>{item.count}건</b></Link></li>)}</ol>;
}
export default function ExplorePage({ rankingOnly = false }: { rankingOnly?: boolean }) {
  const catalog = useCatalog();
  const [baseFilters, setFilters, query] = useFilters();
  const [params] = useSearchParams();
  const [page, setPage] = useState(1);
  const defaultCategory = catalog.data?.allCategories.find(c => c.name === '맛집')?.id ?? null;
  const filters = { ...baseFilters, categoryId: params.has('category') ? baseFilters.categoryId : defaultCategory };
  const navigate = useNavigate();
  const snapshot = useQuery({ queryKey: ['explore', filters.teamId, filters.categoryId, page], enabled: !!catalog.data, queryFn: ({ signal }) => rpc<Explore>('read_explore', { p_team_id: filters.teamId, p_category_id: filters.categoryId, p_rank_page: page }, signal) });
  const effectiveQuery = new URLSearchParams(query); if (filters.categoryId) effectiveQuery.set('category', filters.categoryId);
  const changeFilters = (next: Partial<typeof filters>) => { setPage(1); setFilters(next); };
  const top = snapshot.data?.rankingPage[0];
  return <section className={`explore ${rankingOnly ? 'ranking-page page' : ''}`}><header className="explore-header"><div><Link to="/" className="brand">IT센터 최애 지도</Link><nav aria-label="개인 메뉴"><Link to="/me/favorites">내 최애</Link><Link to="/me/profile">내 정보</Link></nav></div>{rankingOnly ? <h1>최애 랭킹</h1> : <Link className="ranking-line" to={`/rankings?${effectiveQuery}`}><span>지금 인기 있는 최애</span><strong>{snapshot.isPending ? '랭킹을 불러오고 있어요…' : snapshot.isError && !snapshot.data ? '랭킹을 불러오지 못했어요' : top ? `${top.rank}위 ${top.name} · ${top.count}건` : '우리의 첫 최애를 기다려요'}</strong><span>전체 보기 →</span></Link>}{catalog.data ? <FiltersForm catalog={catalog.data} filters={filters} onChange={changeFilters}/> : null}</header>{catalog.error ? <ErrorNotice error={catalog.error} retry={() => void catalog.refetch()}/> : null}{snapshot.error ? <ErrorNotice error={snapshot.error} retry={() => void snapshot.refetch()}/> : null}{snapshot.isPending ? <Loading/> : null}{!rankingOnly ? <MapView pins={snapshot.data?.pins} onSelect={id => navigate(`/targets/${id}?${effectiveQuery}`)}/> : null}<div className="explore-results">{snapshot.data ? snapshot.data.rankingPage.length ? <><RankingList items={snapshot.data.rankingPage} query={effectiveQuery.toString()}/>{snapshot.data.hasMore ? <button onClick={() => setPage(p => p + 1)}>다음 20건 보기</button> : null}{page > 1 ? <button onClick={() => setPage(p => Math.max(1, p - 1))}>이전 20건</button> : null}</> : <Empty><p>{filters.teamId || filters.categoryId ? '이 조건의 최애가 아직 없어요. 조건을 바꾸거나 첫 최애를 남겨 주세요.' : '아직 등록된 최애가 없어요. 우리의 첫 장소를 알려 주세요.'}</p></Empty> : null}</div><footer className="register-bar"><Link className="button primary" to="/register">최애 등록하기</Link></footer></section>;
}
