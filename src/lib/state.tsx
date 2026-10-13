import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Catalog, Snapshot } from '../../shared/contracts';
import { rpc, ApiError } from './api';
import { isRestore } from './revisions';
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: (n, e) => n < 2 && (!(e instanceof ApiError) || !['VALIDATION_ERROR', 'FORBIDDEN', 'TARGET_GONE', 'CONFIG_REQUIRED'].includes(e.code)), retryDelay: attempt => Math.min(500 * 2 ** attempt, 2000), staleTime: 1000, refetchOnWindowFocus: false }, mutations: { retry: false } } });
export const newerOrEqual = (a: string, b: string) => BigInt(a) >= BigInt(b);
const SyncContext = createContext({ stale: false, lastSuccess: 0, epoch: '', observedRevision: '0', refresh: () => {} });
export const useSync = () => useContext(SyncContext);
export function SyncProvider({ children }: { children: ReactNode }) {
  const query = useQueryClient();
  const [state, setState] = useState({ stale: false, lastSuccess: 0, epoch: '', observedRevision: '0' });
  const current = useRef<Snapshot | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    let stopped = false, busy = false, failed = 0;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const tick = async () => {
      if (stopped || busy || document.hidden) return;
      busy = true; controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 1200);
      try {
        const next = await rpc<Snapshot>('read_revision', {}, controller.signal);
        if (stopped) return;
        const previous = current.current;
        if (previous && isRestore(previous, next)) {
          query.clear();
          try { localStorage.removeItem('foodmap.booth:v1'); } catch { /* optional cursor storage */ }
        } else if (previous && next.revision !== previous.revision) {
          void query.invalidateQueries({ predicate: item => item.queryKey[0] !== 'revision' });
        }
        current.current = next; failed = 0;
        setState({ stale: false, lastSuccess: Date.now(), epoch: next.dataEpoch, observedRevision: next.revision });
      } catch { failed++; if (!stopped) setState(s => ({ ...s, stale: true })); }
      finally { clearTimeout(timeout); busy = false; }
    };
    const schedule = () => { clearTimeout(timer); if (stopped || document.hidden) return; timer = setTimeout(() => { const start = Date.now(); void tick().finally(() => { if (!stopped) timer = setTimeout(schedule, Math.max(0, (failed ? Math.min(2000 * 2 ** failed, 30000) : 2000) - (Date.now() - start))); }); }, 0); };
    const resume = () => { if (!document.hidden) schedule(); else { clearTimeout(timer); controller?.abort(); } };
    refreshRef.current = schedule;
    timer = setTimeout(schedule, Math.random() * 200);
    window.addEventListener('online', resume); window.addEventListener('focus', resume); document.addEventListener('visibilitychange', resume);
    const watchdog = setInterval(() => setState(s => s.lastSuccess && Date.now() - s.lastSuccess > 5000 ? { ...s, stale: true } : s), 1000);
    return () => { stopped = true; controller?.abort(); clearTimeout(timer); clearInterval(watchdog); window.removeEventListener('online', resume); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [query]);
  return <SyncContext.Provider value={{ ...state, refresh: () => refreshRef.current() }}>{children}</SyncContext.Provider>;
}
export function useCatalog() { return useQuery({ queryKey: ['catalog'], queryFn: ({ signal }) => rpc<Catalog>('read_catalog', {}, signal) }); }
