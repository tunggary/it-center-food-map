import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Explore, Ranking } from '../../shared/contracts';
import { rpc } from '../lib/api';
import { useCatalog } from '../lib/state';
import { Empty, ErrorNotice, FiltersForm, Loading, useFilters } from '../components/ui';
import { FloatingRegister, MapMessages, MapPanel, MapScene, MapToolbar, usePanelClose } from '../components/MapScene';
import { Icon } from '../components/Icon';
export function RankingList({ items, query = '', onSelect }: { items: Ranking[]; query?: string; onSelect?: (id: string) => void }) {
  return <ol className="rankings">{items.map(item => <li key={item.targetId}>{onSelect ? <button type="button" className="ranking-item" onClick={() => onSelect(item.targetId)}><RankingRow item={item}/></button> : <Link className="ranking-item" to={`/targets/${item.targetId}${query ? `?${query}` : ''}`} state={{ mapBack: true }}><RankingRow item={item}/></Link>}</li>)}</ol>;
}
function RankingRow({ item }: { item: Ranking }) { return <><span className={`rank ${item.rank === 1 ? 'first' : ''}`}>{String(item.rank).padStart(2, '0')}</span><span className="rank-name"><strong>{item.name}</strong><small>{item.kind === 'COURSE' ? '산책코스' : '장소'}</small></span><span className="rank-count"><b>{item.count}</b><small>최애</small></span><Icon name="chevron"/></>; }
export function useExploreFilters() {
  const catalog = useCatalog(), [baseFilters, setFilters, query] = useFilters(), [params] = useSearchParams();
  const defaultCategory = catalog.data?.allCategories.find(c => c.name === '맛집')?.id ?? null;
  const filters = { ...baseFilters, categoryId: params.has('category') ? baseFilters.categoryId : defaultCategory };
  const effectiveQuery = new URLSearchParams(query); effectiveQuery.set('category', filters.categoryId ?? '');
  return { catalog, filters, setFilters, query: effectiveQuery.toString() };
}
export default function ExplorePage() {
  const { catalog, filters, setFilters, query } = useExploreFilters();
  const navigate = useNavigate(), location = useLocation();
  const snapshot = useQuery({ queryKey: ['explore', filters.teamId, filters.categoryId, 1], enabled: !!catalog.data, queryFn: ({ signal }) => rpc<Explore>('read_explore', { p_team_id: filters.teamId, p_category_id: filters.categoryId, p_rank_page: 1 }, signal) });
  const home = location.pathname === '/';
  const pins = snapshot.data?.pins.map(pin => ({ ...pin, name: snapshot.data?.rankingPage.find(r => r.targetId === pin.targetId)?.name }));
  return <MapScene pins={pins} onSelect={id => navigate(`/targets/${id}?${query}`, { state: { mapBack: true } })} className="explore-scene"><MapToolbar/><div className="floating-filters">{catalog.data ? <FiltersForm catalog={catalog.data} filters={filters} onChange={setFilters}/> : null}</div><MapMessages>{catalog.error ? <ErrorNotice error={catalog.error} retry={() => void catalog.refetch()}/> : null}{snapshot.error ? <ErrorNotice error={snapshot.error} retry={() => void snapshot.refetch()}/> : null}</MapMessages>{home ? <><MapPanel title="동료들의 요즘 최애" eyebrow="AROUND THE IT CENTER" className="compact-ranking" footer={<Link className="text-link" to={`/rankings?${query}`} state={{ mapBack: true }}>전체 랭킹 보기 <Icon name="chevron"/></Link>}>{snapshot.isPending ? <Loading text="랭킹을 불러오고 있어요…"/> : snapshot.isError && !snapshot.data ? <p className="muted">랭킹을 불러오지 못했어요</p> : snapshot.data?.rankingPage.length ? <RankingList items={snapshot.data.rankingPage.slice(0, 5)} query={query}/> : snapshot.data ? <Empty>이 조건의 최애가 아직 없어요. 조건을 바꾸거나 첫 최애를 남겨 주세요.</Empty> : null}</MapPanel><FloatingRegister query={query}/></> : <Outlet/>}</MapScene>;
}
export function RankingsPanel() {
  const { catalog, filters, query } = useExploreFilters();
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get('rankPage'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const setPage = (next: number) => { const copy = new URLSearchParams(params); if (next === 1) copy.delete('rankPage'); else copy.set('rankPage', String(next)); setParams(copy, { replace: true }); };
  const snapshot = useQuery({ queryKey: ['explore', filters.teamId, filters.categoryId, page], enabled: !!catalog.data, queryFn: ({ signal }) => rpc<Explore>('read_explore', { p_team_id: filters.teamId, p_category_id: filters.categoryId, p_rank_page: page }, signal) });
  const close = usePanelClose(`/?${query}`);
  return <MapPanel title="우리의 최애 랭킹" eyebrow="FAVORITES RANKING" onClose={close}>{snapshot.error ? <ErrorNotice error={snapshot.error} retry={() => void snapshot.refetch()}/> : null}{snapshot.isPending ? <Loading/> : null}{snapshot.data ? snapshot.data.rankingPage.length ? <><RankingList items={snapshot.data.rankingPage} query={query}/><div className="pagination">{page > 1 ? <button onClick={() => setPage(page - 1)}>이전 20건</button> : null}<span>{page}페이지</span>{snapshot.data.hasMore ? <button onClick={() => setPage(page + 1)}>다음 20건 보기</button> : null}</div></> : <Empty>이 조건의 최애가 아직 없어요.</Empty> : null}</MapPanel>;
}
