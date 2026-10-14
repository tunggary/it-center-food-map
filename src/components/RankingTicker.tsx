import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Ranking } from '../../shared/contracts';
import { Icon } from './Icon';
export function RankingTicker({ items, query, pending, failed }: { items: Ranking[]; query: string; pending: boolean; failed: boolean }) {
  const [index, setIndex] = useState(0), [paused, setPaused] = useState(false), [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), [hidden, setHidden] = useState(document.hidden);
  const item = items[index % Math.max(items.length, 1)];
  useEffect(() => { const change = () => setHidden(document.hidden); document.addEventListener('visibilitychange', change); return () => document.removeEventListener('visibilitychange', change); }, []);
  useEffect(() => { if (items.length < 2 || paused || hovered || focused || hidden) return; const timer = setInterval(() => setIndex(i => (i + 1) % items.length), 4000); return () => clearInterval(timer); }, [items.length, paused, hovered, focused, hidden]);
  return <section className="ranking-ticker" aria-label="실시간 최애 랭킹" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
    <div className="ticker-window">{item ? <Link key={`${item.targetId}-${index}`} className="ticker-item" to={`/targets/${item.targetId}?${query}`}><span className="ticker-rank">{item.rank}<small>위</small></span><span className="ticker-name"><small>지금 동료들의 최애</small><strong>{item.name}</strong></span><span className="ticker-count">{item.count}<small>건</small></span></Link> : <p className="ticker-placeholder">{pending ? '랭킹을 불러오고 있어요…' : failed ? '랭킹을 불러오지 못했어요' : '첫 최애를 기다려요'}</p>}</div>
    <div className="ticker-actions">{items.length > 1 ? <button type="button" className="ticker-pause" aria-label={paused ? '랭킹 자동 전환 재생' : '랭킹 자동 전환 일시정지'} aria-pressed={paused} onClick={() => setPaused(v => !v)}><Icon name={paused ? 'play' : 'pause'}/></button> : null}<Link to={`/rankings?${query}`} aria-label="전체 랭킹 보기"><Icon name="chevron"/></Link></div>
  </section>;
}
