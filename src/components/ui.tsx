import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Catalog, Filters } from '../../shared/contracts';
import { errorMessage } from '../lib/api';
import { useSync } from '../lib/state';
export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) { return <div className="notice error" role="alert"><p>{errorMessage(error)}</p>{retry ? <button type="button" onClick={retry}>다시 시도</button> : null}</div>; }
export function Loading({ text = '불러오고 있어요…' }: { text?: string }) { return <p role="status" className="notice">{text}</p>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }
export function Page({ title, children }: { title: string; children: ReactNode }) { return <section className="page"><header className="page-heading"><Link to="/" aria-label="지도로 돌아가기">← 지도</Link><h1>{title}</h1></header>{children}</section>; }
export function SyncNotice() {
  const sync = useSync();
  return sync.stale ? <div className="connection" role="status">갱신이 잠시 중단됐어요.{sync.lastSuccess ? ` 마지막 확인 ${new Date(sync.lastSuccess).toLocaleTimeString('ko')}` : ''} <button onClick={sync.refresh}>다시 연결</button></div> : null;
}
export function useFilters(): [Filters, (next: Partial<Filters>) => void, string] {
  const [params, set] = useSearchParams();
  const filters = { teamId: params.get('team') || null, categoryId: params.get('category') || null };
  return [filters, next => { const copy = new URLSearchParams(params); copy.delete('rankPage'); for (const [k, v] of Object.entries(next)) { const key = k === 'teamId' ? 'team' : 'category'; copy.set(key, v ?? ''); } set(copy); }, params.toString()];
}
export function FiltersForm({ catalog, filters, onChange, teams = true }: { catalog: Catalog; filters: Filters; onChange: (filters: Partial<Filters>) => void; teams?: boolean }) {
  return <div className="filters">{teams ? <label>팀<select aria-label="팀 필터" value={filters.teamId ?? ''} onChange={e => onChange({ teamId: e.target.value || null })}><option value="">전체 팀</option>{catalog.allTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label> : null}<label>카테고리<select aria-label="카테고리 필터" value={filters.categoryId ?? ''} onChange={e => onChange({ categoryId: e.target.value || null })}><option value="">전체 카테고리</option>{catalog.allCategories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>;
}
export function ConfirmDialog({ title, children, open, onClose, onConfirm, action = '삭제', busy = false }: { title: string; children: ReactNode; open: boolean; onClose: () => void; onConfirm: () => void; action?: string; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); else if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} aria-labelledby="confirmation-title"><h2 id="confirmation-title">{title}</h2>{children}<div className="actions"><button type="button" onClick={onClose} disabled={busy} autoFocus>취소</button><button type="button" className="danger" onClick={onConfirm} disabled={busy}>{busy ? '처리 중…' : action}</button></div></dialog>;
}
export function useCommandKey() {
  const key = useRef(crypto.randomUUID());
  const [locked, setLocked] = useState(false);
  return { key: key.current, locked, lock: () => setLocked(true), change: () => { if (!locked) key.current = crypto.randomUUID(); }, newCommand: () => { key.current = crypto.randomUUID(); setLocked(false); } };
}
