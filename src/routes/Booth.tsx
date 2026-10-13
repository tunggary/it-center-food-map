import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Announcement, Booth, EventPage, TargetDetail } from '../../shared/contracts';
import { rpc } from '../lib/api';
import { useCatalog, useSync } from '../lib/state';
import { restoreBoothCursor } from '../lib/revisions';
import { ErrorNotice, FiltersForm, Loading, useFilters } from '../components/ui';
import { MapView } from '../components/Map';
import { RankingList } from './Explore';
const CURSOR_KEY = 'foodmap.booth:v1';
export default function BoothPage() {
  const catalog = useCatalog(), sync = useSync();
  const [filters, change] = useFilters();
  const [selected, setSelected] = useState('');
  const snapshot = useQuery({ queryKey: ['booth', filters.categoryId], queryFn: ({ signal }) => rpc<Booth>('read_booth', { p_pin_category_id: filters.categoryId }, signal) });
  const course = useQuery({ queryKey: ['target', selected], enabled: !!selected, queryFn: ({ signal }) => rpc<TargetDetail>('read_target', { p_target_id: selected, p_team_id: null, p_category_id: null, p_cursor: null, p_expected_revision: null }, signal) });
  const [announcement, setAnnouncement] = useState<Announcement | null>(null), [error, setError] = useState<unknown>();
  const latest = useRef('0'), displayed = useRef<string | null>(null);
  latest.current = sync.observedRevision !== '0' ? sync.observedRevision : snapshot.data?.revision ?? '0';
  const epoch = snapshot.data?.dataEpoch;
  useEffect(() => {
    if (!epoch || !snapshot.data) return;
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const sleep = (ms: number) => new Promise<void>(resolve => { const cancel = () => { clearTimeout(timer); resolve(); }; timer = setTimeout(() => { abort.signal.removeEventListener('abort', cancel); resolve(); }, ms); abort.signal.addEventListener('abort', cancel, { once: true }); });
    let completed = snapshot.data.revision;
    try { completed = restoreBoothCursor(JSON.parse(localStorage.getItem(CURSOR_KEY) ?? 'null'), snapshot.data); } catch { /* treat unavailable cursor as new booth visit */ }
    const persist = (value: string) => { completed = value; try { localStorage.setItem(CURSOR_KEY, JSON.stringify({ epoch, cursor: value })); } catch { /* replay possible on reload, never claim persistence */ } };
    persist(completed);
    const run = async () => {
      while (!stopped) {
        try {
          if (BigInt(latest.current) < BigInt(completed)) break;
          const until = latest.current;
          if (BigInt(until) <= BigInt(completed)) { await sleep(250); continue; }
          const page = await rpc<EventPage>('read_events', { p_after_revision: completed, p_until_revision: until, p_limit: 100 }, abort.signal);
          if (stopped) return;
          for (const event of page.rows) {
            if (stopped) return;
            if (event.favoriteId) {
              const current = await rpc<Announcement>('read_announcement', { p_event_revision: event.revision }, abort.signal);
              if (stopped) return;
              if (!current.skip) { displayed.current = event.revision; setAnnouncement(current); await sleep(4000); if (stopped) return; setAnnouncement(null); displayed.current = null; }
            }
            persist(event.revision);
          }
          persist(page.nextCursor); setError(undefined);
        } catch (e) { if (!stopped) { setError(e); await sleep(2000); } }
      }
    };
    void run();
    return () => { stopped = true; abort.abort(); clearTimeout(timer); displayed.current = null; setAnnouncement(null); };
  // Restart only on restore, not on each map revision: received events do not mark display complete.
  }, [epoch]);
  useEffect(() => {
    const revision = displayed.current;
    if (!revision) return;
    let active = true;
    void rpc<Announcement>('read_announcement', { p_event_revision: revision }).then(value => { if (active && displayed.current === revision) setAnnouncement(value.skip ? null : value); }).catch(setError);
    return () => { active = false; };
  }, [sync.observedRevision]);
  return <section className="booth"><header className="booth-heading"><Link to="/">IT센터 최애 지도</Link><h1>우리의 최애가 모이고 있어요</h1><p>전체 팀 · 카테고리별 랭킹</p></header><div className="announcement" role="status" aria-live="polite">{announcement && !announcement.skip ? <><strong>{announcement.nickname}</strong> · {announcement.teamName}<span>{announcement.targetName}을 최애로 등록했어요!</span></> : <span>동료들의 새 최애를 기다려요</span>}</div>{error ? <ErrorNotice error={error}/> : null}{snapshot.error ? <ErrorNotice error={snapshot.error} retry={() => void snapshot.refetch()}/> : null}{snapshot.isPending ? <Loading/> : null}{catalog.data ? <FiltersForm catalog={catalog.data} filters={filters} onChange={change} teams={false}/> : null}<div className="booth-grid"><MapView pins={snapshot.data?.pins} points={course.data?.target.kind === 'COURSE' ? course.data.target.points ?? [] : []} onSelect={setSelected} selectedId={selected}/><aside>{snapshot.data?.categoryRankings.map(category => <section key={category.categoryId}><h2>{category.categoryName}</h2><RankingList items={category.rankings.slice(0, 5)} query={`category=${category.categoryId}`}/>{!category.rankings.length ? <p>첫 최애를 기다려요.</p> : null}<Link to={`/rankings?category=${category.categoryId}`}>전체 보기</Link></section>)}</aside></div>{selected ? <Link to={`/targets/${selected}`}>선택한 장소·코스 상세 보기</Link> : null}<p className="muted">부스 화면을 전경에 유지하고 PC 절전을 꺼 주세요.</p></section>;
}
