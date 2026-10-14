import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Favorite, Participant } from '../../shared/contracts';
import { profileSchema } from '../../shared/validation';
import { edge } from '../lib/api';
import { prepareIdentity } from '../lib/identity';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading, Page } from '../components/ui';
export default function MePage({ profile = false }: { profile?: boolean }) {
  const [token, setToken] = useState(''), [error, setError] = useState<unknown>();
  const [nickname, setNickname] = useState(''), [busy, setBusy] = useState(false), [cursor, setCursor] = useState<string | null>(null), [saved, setSaved] = useState(false);
  const key = useRef(crypto.randomUUID());
  const dirty = useRef(false);
  const query = useQueryClient();
  useEffect(() => { void prepareIdentity().then(setToken).catch(setError); }, []);
  const me = useQuery({ queryKey: ['me', token], enabled: !!token, queryFn: () => edge<Participant | null>('/me', { token }) });
  const favorites = useQuery({ queryKey: ['mine', token, cursor], enabled: !!token && !profile, queryFn: ({ signal }) => edge<{ favorites: Favorite[]; nextCursor: string | null }>(`/me/favorites${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { token, signal }) });
  useEffect(() => { if (me.data && !dirty.current) setNickname(me.data.nickname); }, [me.data]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!me.data || busy) return; setBusy(true); setError(undefined); setSaved(false);
    try { const parsed = profileSchema.parse({ requestKey: key.current, expectedVersion: me.data.version, nickname }); await edge('/me', { method: 'PATCH', token, body: parsed }); dirty.current = false; await query.invalidateQueries(); key.current = crypto.randomUUID(); setSaved(true); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <div className="personal-page"><Page title={profile ? '내 참여 정보' : '내 장소/코스'}><nav className="personal-tabs notranslate" translate="no" aria-label="개인 화면"><Link aria-current={!profile ? 'page' : undefined} to="/me/favorites"><Icon name="heart"/>내 장소/코스</Link><Link aria-current={profile ? 'page' : undefined} to="/me/profile"><Icon name="user"/>내 정보</Link></nav>{error ? <ErrorNotice error={error}/> : null}{me.error ? <ErrorNotice error={me.error} retry={() => void me.refetch()}/> : null}{me.isPending ? <Loading/> : null}{profile ? me.data ? <><form className="profile-card" onSubmit={save}><p className="eyebrow notranslate" translate="no">MY PROFILE</p><h2>동료들에게 보이는 내 정보</h2><label>닉네임<input value={nickname} onChange={e => { setNickname(e.target.value); dirty.current = true; key.current = crypto.randomUUID(); setSaved(false); }} required/></label><p>기존 모든 등록에도 현재 닉네임이 표시돼요.</p><p>팀: <strong>{me.data.teamName}</strong></p><p className="muted">팀이 잘못 입력됐다면 운영자에게 정정을 요청해 주세요.</p><button type="submit" className="primary" disabled={busy}>{busy ? '저장 중…' : '닉네임 저장'}</button>{saved ? <p role="status">닉네임을 저장했어요.</p> : null}</form><p className="participant-code">운영자 확인용 참여자 코드: <code>{me.data.id}</code></p><p className="notice">이 브라우저의 참여 정보를 삭제하거나 다른 브라우저·기기를 쓰면 이전 등록의 수정 권한을 자동으로 복구할 수 없어요.</p></> : !me.isPending ? <Empty><p>아직 첫 참여 전이에요. 최애를 등록할 때 닉네임과 팀을 함께 입력해 주세요.</p><Link to="/register">첫 최애 등록하기</Link></Empty> : null : <>{favorites.error ? <ErrorNotice error={favorites.error} retry={() => void favorites.refetch()}/> : null}{favorites.isPending ? <Loading/> : null}{favorites.data ? favorites.data.favorites.length ? <><div className="favorites">{favorites.data.favorites.map(f => <article className="favorite" key={f.id}><Link to={`/targets/${f.targetId}`}><h2>{f.target?.name ?? '내 장소/코스'}</h2></Link><span className="badge">{f.categoryName}</span><p className="message">{f.message}</p><Link className="text-link" to={`/register?favorite=${f.id}`} state={{ favorite: f }}>수정·삭제</Link></article>)}</div>{favorites.data.nextCursor ? <button onClick={() => setCursor(favorites.data!.nextCursor)}>다음 20건 보기</button> : null}{cursor ? <button onClick={() => setCursor(null)}>처음으로</button> : null}</> : <Empty><p>등록한 최애가 아직 없어요.</p><Link to="/register">최애 등록하기</Link></Empty> : null}</>}</Page></div>;
}
