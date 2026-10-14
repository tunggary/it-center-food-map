import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Participant } from '../../shared/contracts';
import { ApiError, edge } from '../lib/api';
import { prepareIdentity, resetIdentity, storedToken } from '../lib/identity';
import { personalQuery, useParticipant } from '../lib/participant';
import { useCatalog } from '../lib/state';
import { Icon } from './Icon';
import { ErrorNotice, Loading } from './ui';

type Intent = { to: string; state?: unknown; cancel?: () => void };
const RegistrationContext = createContext<((intent: Intent) => void) | null>(null);
export function RegistrationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate(), location = useLocation(), client = useQueryClient();
  const { token } = useParticipant();
  const previousLocation = useRef(location.key);
  const previousToken = useRef(token), inFlight = useRef(false), active = useRef<Intent | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null), [checking, setChecking] = useState(false), [checkFailed, setCheckFailed] = useState(false);
  const [error, setError] = useState<unknown>(), [expired, setExpired] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [nickname, setNickname] = useState(''), [teamId, setTeamId] = useState('');
  const command = useRef<{ requestKey: string; nickname: string; teamId: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLElement | null>(null);
  const catalog = useCatalog();
  useEffect(() => {
    if (previousToken.current !== token) { client.removeQueries({ predicate: q => personalQuery(q.queryKey) && q.queryKey[1] !== token }); previousToken.current = token; }
  }, [token, client]);
  const close = () => {
    if (inFlight.current) return;
    const cancel = active.current?.cancel; active.current = null; setIntent(null); setError(undefined); command.current = null; setUncertain(false);
    trigger.current?.focus({ preventScroll: true }); cancel?.();
  };
  const complete = async (profile: Participant, identityToken: string) => {
    await client.cancelQueries({ queryKey: ['me', identityToken], exact: true });
    client.setQueryData(['me', identityToken], profile);
    void client.invalidateQueries({ predicate: q => personalQuery(q.queryKey) && q.queryKey[0] !== 'me' });
    const next = active.current; active.current = null; setIntent(null); command.current = null; setUncertain(false);
    if (next) navigate(next.to, { state: next.state });
  };
  const check = async (next: Intent) => {
    if (inFlight.current || active.current) return;
    inFlight.current = true; active.current = next; trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setChecking(true); setCheckFailed(false); setError(undefined); setExpired(false); setNickname(''); setTeamId('');
    try {
      const identityToken = storedToken();
      const profile = identityToken ? await client.fetchQuery({ queryKey: ['me', identityToken], staleTime: 0, retry: false, queryFn: () => edge<Participant | null>('/me', { token: identityToken }) }) : null;
      if (storedToken() !== identityToken) throw new Error('참여 정보가 변경됐어요. 다시 시도해 주세요.');
      if (active.current !== next) return;
      if (profile && identityToken) await complete(profile, identityToken);
      else { if (identityToken) client.setQueryData(['me', identityToken], null); setIntent(next); }
    } catch (e) { if (active.current !== next) return; setCheckFailed(true); setError(e); setExpired(e instanceof ApiError && ['IDENTITY_EXPIRED', 'IDENTITY_REQUIRED'].includes(e.code)); setIntent(next); }
    finally { inFlight.current = false; setChecking(false); }
  };
  useEffect(() => {
    const node = dialog.current;
    if (intent && !node?.open) node?.showModal(); else if (!intent && node?.open) node.close();
  }, [intent]);
  // Browser back/forward cancels the pending continuation instead of navigating later.
  useEffect(() => { if (previousLocation.current !== location.key) { active.current = null; setIntent(null); previousLocation.current = location.key; } }, [location.key]);
  const retry = () => { const next = active.current; active.current = null; setIntent(null); if (next) void check(next); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(undefined);
    try {
      const { createProfileSchema } = await import('../../shared/validation');
      const body = command.current ?? createProfileSchema.parse({ requestKey: crypto.randomUUID(), nickname, teamId });
      const identityToken = await prepareIdentity();
      command.current = body; setUncertain(true);
      try { await edge('/me', { method: 'POST', token: identityToken, body }); }
      catch (e) { if (!(e instanceof ApiError && e.code === 'VERSION_CONFLICT')) throw e; }
      const profile = await edge<Participant | null>('/me', { token: identityToken });
      if (!profile || identityToken !== storedToken()) throw new Error('참여 정보 저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.');
      await complete(profile, identityToken);
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && !['INTERNAL_ERROR', 'NETWORK_ERROR', 'DEPENDENCY_UNAVAILABLE'].includes(e.code)) { command.current = null; setUncertain(false); }
      if (storedToken() && e instanceof ApiError && ['IDENTITY_EXPIRED', 'IDENTITY_REQUIRED'].includes(e.code)) setExpired(true);
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <RegistrationContext.Provider value={next => { void check(next); }}>{children}{checking ? <div className="registration-check" role="status">참여 정보를 확인하고 있어요…</div> : null}
    <dialog ref={dialog} className="registration-dialog" aria-labelledby="registration-title" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } }}>
      <div className="registration-heading"><h2 id="registration-title">첫 참여 정보를 입력해 주세요</h2><button type="button" className="icon-button" aria-label="참여 정보 모달 닫기" disabled={busy} onClick={close}><Icon name="close"/></button></div><p>닉네임과 팀은 동료들에게 공개돼요. 팀 정정은 운영자에게 요청해 주세요.</p>
      {expired ? <><ErrorNotice error={error}/><p>새 참여자로 시작하면 이전 등록의 수정 권한은 이어지지 않아요.</p><button type="button" onClick={() => { resetIdentity(); client.removeQueries({ predicate: q => personalQuery(q.queryKey) }); setExpired(false); setCheckFailed(false); setError(undefined); }}>새 참여자로 시작</button></> : checkFailed ? <><ErrorNotice error={error} retry={retry}/><button type="button" onClick={close}>취소</button></> : <form onSubmit={save}>
        {error ? <ErrorNotice error={error}/> : null}{catalog.error ? <ErrorNotice error={catalog.error} retry={() => void catalog.refetch()}/> : null}
        <fieldset disabled={busy || uncertain}><label>닉네임<input aria-label="닉네임" autoFocus value={nickname} onChange={e => setNickname(e.target.value)} required/><small>1~20자</small></label><label>팀<select value={teamId} onChange={e => setTeamId(e.target.value)} required><option value="">팀을 선택해 주세요</option>{catalog.data?.selectableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></fieldset>
        {uncertain && !busy ? <p role="status">저장 결과를 다시 확인해 주세요. 같은 요청으로 재시도해요.</p> : null}{catalog.data && !catalog.data.selectableTeams.length ? <p role="status">등록 가능한 팀이 없어요. 운영자에게 문의해 주세요.</p> : null}
        <div className="actions"><button type="button" disabled={busy} onClick={close}>취소</button><button className="primary" disabled={busy || !catalog.data?.selectableTeams.length} type="submit">{busy ? '저장 중…' : uncertain ? '저장 결과 확인' : '저장하고 계속하기'}</button></div>
      </form>}{expired ? <button type="button" onClick={close}>취소</button> : null}
    </dialog></RegistrationContext.Provider>;
}
export function RegistrationLink({ to, state, onClick, ...props }: ComponentProps<typeof Link>) {
  const start = useContext(RegistrationContext);
  return <Link {...props} to={to} state={state} onClick={e => { onClick?.(e); if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; if (start) { e.preventDefault(); start({ to: typeof to === 'string' ? to : `${to.pathname ?? ''}${to.search ?? ''}${to.hash ?? ''}`, state }); } }}/>;
}
export function RegistrationGuard({ children }: { children: ReactNode }) {
  const { participant, me, token } = useParticipant(), start = useContext(RegistrationContext), location = useLocation(), navigate = useNavigate();
  const admittedToken = useRef<string | null>(null);
  if (admittedToken.current !== token) admittedToken.current = null;
  if (participant) admittedToken.current = token;
  const admitted = !!token && admittedToken.current === token;
  const attempted = useRef(false), params = new URLSearchParams(location.search);
  const edit = !!params.get('favorite') || !!(location.state as { favorite?: unknown } | null)?.favorite;
  useEffect(() => {
    if (participant) attempted.current = false;
    if (attempted.current || !start || (token && me.isPending) || participant || admitted || edit) return;
    attempted.current = true;
    const fallback = params.get('from') === 'detail' && params.get('target') ? `/targets/${params.get('target')}${params.get('return') ? `?${params.get('return')}` : ''}` : `/${params.get('return') ? `?${params.get('return')}` : ''}`;
    start({ to: location.pathname + location.search, state: location.state, cancel: () => navigate(fallback, { replace: true }) });
  });
  // Keep the mounted draft during a temporary profile read failure, hiding protected UI.
  if (admitted) return <><div hidden={!participant}>{children}</div>{!participant ? <section className="page"><ErrorNotice error={me.error ?? new Error('참여 정보를 다시 확인해 주세요.')} retry={() => void me.refetch()}/><RegistrationLink to={location.pathname + location.search} state={location.state}>참여 정보 확인하기</RegistrationLink></section> : null}</>;
  if (edit && !(token && me.isPending)) return <section className="page"><ErrorNotice error={me.error ?? new Error('본인 참여 정보를 확인한 뒤 내 장소/코스에서 다시 선택해 주세요.')} retry={me.error ? () => void me.refetch() : undefined}/><Link to="/">지도로 돌아가기</Link></section>;
  return <Loading text="참여 정보를 확인하고 있어요…"/>;
}
