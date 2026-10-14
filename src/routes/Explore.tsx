import { useEffect } from 'react';
import { RankTrophy } from '../components/RankTrophy';
import { Link, Outlet, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Explore, Participant, Pin, Ranking } from '../../shared/contracts';
import { ApiError, edge, rpc } from '../lib/api';
import { useCatalog } from '../lib/state';
import { Empty, ErrorNotice, FiltersForm, Loading, useFilters } from '../components/ui';
import { FloatingRegister, MapMessages, MapPanel, MapScene, MapToolbar, usePanelClose } from '../components/MapScene';
import { useMobileScreen } from '../lib/viewport';
import { RankingTicker } from '../components/RankingTicker';
import { Icon } from '../components/Icon';
import { storedToken } from '../lib/identity';
import { rankingTabs, rankingTab, rankingFilters, rankingHomeQuery, type RankingTab } from '../lib/ranking';
export function RankingList({ items, query = '', onSelect, population }: { items: Ranking[]; query?: string; onSelect?: (id: string) => void; population?: Pick<Pin, 'count'>[] }) {
  const location = useLocation();
  const counts = new Map<number, number>();
  for (const item of population ?? []) counts.set(item.count, (counts.get(item.count) ?? 0) + 1);
  return <ol className="rankings">{items.map(item => <li key={item.targetId}>{onSelect ? <button type="button" className="ranking-item" onClick={() => onSelect(item.targetId)}><RankingRow item={item} emphasize={!!population} tied={(counts.get(item.count) ?? 0) > 1}/></button> : <Link className="ranking-item" to={`/targets/${item.targetId}${query ? `?${query}` : ''}`} replace={location.pathname !== '/'}><RankingRow item={item} emphasize={!!population} tied={(counts.get(item.count) ?? 0) > 1}/></Link>}</li>)}</ol>;
}
function RankingRow({ item, emphasize, tied }: { item: Ranking; emphasize: boolean; tied: boolean }) {
  const trophy = item.rank >= 1 && item.rank <= 3;
  const trophyName = item.rank === 1 ? '금색 트로피' : item.rank === 2 ? '은색 트로피' : item.rank === 3 ? '코랄 트로피' : '';
  return <>{emphasize ? <span className="rank rank-badge">
    <span className="rank-symbol" aria-hidden="true">{trophy ? <RankTrophy rank={item.rank}/> : item.rank}</span>
    <span className="visually-hidden">{tied ? '공동 ' : ''}{item.rank}위{trophyName ? ` · ${trophyName}` : ''}</span>
    {tied ? <small className="rank-tie" aria-hidden="true">공동</small> : null}
  </span> : <span className={`rank ${item.rank === 1 ? 'first' : ''}`}>{String(item.rank).padStart(2, '0')}</span>}<span className="rank-name"><strong>{item.name}</strong><small>{item.kind === 'COURSE' ? '산책코스' : '장소'}</small></span><span className="rank-count"><b>{item.count}</b><small>최애</small></span><Icon name="chevron"/></>; }
export function useExploreFilters() {
  const catalog = useCatalog(), [filters, setFilters, query] = useFilters();
  return { catalog, filters, setFilters, query };
}
export default function ExplorePage() {
  const { catalog, filters, setFilters, query } = useExploreFilters();
  const navigate = useNavigate(), location = useLocation();
  const mobile = useMobileScreen();
  const detailOpen = location.pathname.startsWith('/targets/');
  const rankingOpen = location.pathname === '/rankings';
  const [params, setParams] = useSearchParams();
  const tab = rankingTab(params, catalog.data);
  const token = storedToken();
  const needsTeam = rankingOpen && tab === 'custom' && !params.has('team');
  const me = useQuery({ queryKey: ['me', token], enabled: needsTeam && !!token, queryFn: ({ signal }) => edge<Participant | null>('/me', { token: token!, signal }) });
  const waitingForTeam = needsTeam && !!token && me.isPending;
  const identityMissing = me.error instanceof ApiError && ['IDENTITY_REQUIRED', 'IDENTITY_EXPIRED'].includes(me.error.code);
  const meError = needsTeam && !identityMissing ? me.error : null;
  useEffect(() => {
    if (!rankingOpen || !catalog.data || waitingForTeam || meError) return;
    const copy = new URLSearchParams(params);
    copy.set('rankingTab', tab);
    if (!params.has('rankingTab') && tab !== 'custom') { copy.delete('team'); copy.delete('category'); }
    if (needsTeam) copy.set('team', identityMissing ? '' : me.data?.teamId ?? '');
    if (tab === 'custom' && !copy.has('category')) copy.set('category', '');
    if (copy.toString() !== params.toString()) setParams(copy, { replace: true });
  }, [rankingOpen, catalog.data, waitingForTeam, needsTeam, identityMissing, meError, me.data?.teamId, tab, params, setParams]);
  const requestedPage = Number(params.get('rankPage'));
  const page = rankingOpen && Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const selectedFilters = rankingFilters(tab, params, catalog.data);
  const mapFilters = detailOpen ? { teamId: null, categoryId: null } : rankingOpen ? selectedFilters : filters;
  const ready = !!catalog.data && !!mapFilters && !(rankingOpen && (waitingForTeam || needsTeam || params.get('rankingTab') !== tab));
  const snapshot = useQuery({ queryKey: ['explore', mapFilters?.teamId, mapFilters?.categoryId, page], enabled: ready, queryFn: ({ signal }) => rpc<Explore>('read_explore', { p_team_id: mapFilters!.teamId, p_category_id: mapFilters!.categoryId, p_rank_page: page }, signal) });
  const changeRanking = (next: { tab?: RankingTab; teamId?: string | null; categoryId?: string | null; page?: number }) => {
    const copy = new URLSearchParams(params);
    if (!params.has('rankingTab') && tab !== 'custom') { copy.delete('team'); copy.delete('category'); }
    if (next.tab) copy.set('rankingTab', next.tab);
    if ('teamId' in next) copy.set('team', next.teamId ?? '');
    if ('categoryId' in next) copy.set('category', next.categoryId ?? '');
    if (next.page && next.page > 1) copy.set('rankPage', String(next.page)); else copy.delete('rankPage');
    setParams(copy);
  };
  const ranking = { catalog, tab, filters: selectedFilters, snapshot, page, changeRanking, query, ready, meError, retryMe: () => void me.refetch() };
  const home = location.pathname === '/';
  const pins = (rankingOpen && !ready ? undefined : snapshot.data)?.pins.map(pin => ({ ...pin, name: snapshot.data?.rankingPage.find(r => r.targetId === pin.targetId)?.name }));
  return <MapScene pins={pins} onSelect={id => navigate(`/targets/${id}?${query}`, { replace: location.pathname !== '/' })} className={`explore-scene ${detailOpen ? 'detail-scene' : ''} ${rankingOpen ? 'ranking-scene' : ''}`}><MapToolbar/>{home && mobile ? <RankingTicker items={snapshot.data?.rankingPage.slice(0, 5) ?? []} query={query} pending={snapshot.isPending} failed={snapshot.isError && !snapshot.data}/> : null}<div className="floating-filters">{catalog.data && !detailOpen && !rankingOpen ? <FiltersForm catalog={catalog.data} filters={filters} onChange={setFilters}/> : null}</div><MapMessages>{catalog.error ? <ErrorNotice error={catalog.error} retry={() => void catalog.refetch()}/> : null}{!rankingOpen && snapshot.error ? <ErrorNotice error={snapshot.error} retry={() => void snapshot.refetch()}/> : null}</MapMessages>{home ? <>{!mobile ? <MapPanel title="동료들의 요즘 최애" eyebrow="AROUND THE IT CENTER" className="compact-ranking" footer={<Link className="text-link" to={`/rankings?${query}`}>전체 랭킹 보기 <Icon name="chevron"/></Link>}>{snapshot.isPending ? <Loading text="랭킹을 불러오고 있어요…"/> : snapshot.isError && !snapshot.data ? <p className="muted">랭킹을 불러오지 못했어요</p> : snapshot.data?.rankingPage.length ? <RankingList items={snapshot.data.rankingPage.slice(0, 5)} query={query}/> : snapshot.data ? <Empty>이 조건의 최애가 아직 없어요. 조건을 바꾸거나 첫 최애를 남겨 주세요.</Empty> : null}</MapPanel> : null}<FloatingRegister query={query}/></> : <Outlet context={ranking}/>}</MapScene>;
}
type RankingContext = {
  catalog: ReturnType<typeof useCatalog>; tab: RankingTab; filters: ReturnType<typeof rankingFilters>;
  snapshot: ReturnType<typeof useQuery<Explore>>; page: number; query: string; ready: boolean;
  changeRanking: (next: { tab?: RankingTab; teamId?: string | null; categoryId?: string | null; page?: number }) => void;
  meError: unknown; retryMe: () => void;
};
export function RankingsPanel() {
  const { catalog, tab, filters, snapshot, page, changeRanking, query, ready, meError, retryMe } = useOutletContext<RankingContext>();
  const close = usePanelClose(`/?${rankingHomeQuery(new URLSearchParams(query), catalog.data)}`);
  return <MapPanel title="우리의 최애 랭킹" eyebrow="FAVORITES RANKING" onClose={close} className="tabbed-ranking">
    <div className="ranking-tabs" role="tablist" aria-label="랭킹 분류">{rankingTabs.map((item, index) => <button key={item.id} id={`ranking-tab-${item.id}`} role="tab" type="button" aria-selected={tab === item.id} aria-controls="ranking-results" tabIndex={tab === item.id ? 0 : -1} onClick={() => changeRanking({ tab: item.id })} onKeyDown={event => {
      const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rankingTabs.length - 1 : offset ? (index + offset + rankingTabs.length) % rankingTabs.length : null;
      if (next === null) return;
      event.preventDefault(); changeRanking({ tab: rankingTabs[next].id }); document.getElementById(`ranking-tab-${rankingTabs[next].id}`)?.focus();
    }}>{item.label}</button>)}</div>
    <div id="ranking-results" role="tabpanel" aria-labelledby={`ranking-tab-${tab}`}>
      {tab === 'custom' && catalog.data && filters ? <div className="ranking-custom-filters"><FiltersForm catalog={catalog.data} filters={filters} onChange={changeRanking}/></div> : null}
      {meError ? <ErrorNotice error={meError} retry={retryMe}/> : null}
      {catalog.data && !filters ? <Empty>이 카테고리를 찾을 수 없어요.</Empty> : null}
      {!meError && ((!catalog.data && !catalog.error) || (filters && (!ready || snapshot.isPending))) ? <Loading/> : null}
      {ready && snapshot.error ? <ErrorNotice error={snapshot.error} retry={() => void snapshot.refetch()}/> : null}
      {ready && snapshot.data ? snapshot.data.rankingPage.length ? <><RankingList items={snapshot.data.rankingPage} query={query} population={snapshot.data.pins}/><div className="pagination">{page > 1 ? <button onClick={() => changeRanking({ page: page - 1 })}>이전 20건</button> : null}<span>{page}페이지</span>{snapshot.data.hasMore ? <button onClick={() => changeRanking({ page: page + 1 })}>다음 20건 보기</button> : null}</div></> : <Empty>이 조건의 최애가 아직 없어요.</Empty> : null}
    </div>
  </MapPanel>;
}
