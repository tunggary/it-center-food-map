"""Real PostgreSQL concurrency checks against the local Docker database only."""
import concurrent.futures
import json
import subprocess
import uuid
CONTAINER = 'supabase_db_it-center-food-map'
def sql(query):
    result = subprocess.run(['docker','exec','-i',CONTAINER,'psql','-U','postgres','-d','postgres','-XAt','-v','ON_ERROR_STOP=1'],input=query,text=True,capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()
def literal(value):
    return "'" + json.dumps(value,ensure_ascii=False).replace("'","''") + "'::jsonb"
actor=json.loads(sql("select public.gateway_session('" + uuid.uuid4().hex + uuid.uuid4().hex + "');"))['identityId']
request=str(uuid.uuid4())
payload={'requestKey':request,'payloadHash':'concurrent','target':{'type':'course','name':'동시성 검증 코스','points':[[127,37],[127.002,37.002]]},'categoryId':'20000000-0000-4000-8000-000000000003','message':'동시 제출','photos':[],'profile':{'nickname':'검증','teamId':'10000000-0000-4000-8000-000000000001'}}
try:
    query="select public.gateway_create_favorite('"+actor+"',"+literal(payload)+");"
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        results=[json.loads(r) for r in pool.map(sql,[query]*20)]
    assert len({r['resourceId'] for r in results})==1
    assert sum(not r['replayed'] for r in results)==1
    target=results[0]['targetId'];fav=results[0]['resourceId']
    assert sql("select count(*) from app_private.registration_events where favorite_id='"+fav+"';")=='1'
    assert sql("select count(*) from app_private.targets where id='"+target+"';")=='1'
    print('PASS: 20 concurrent commands -> 1 course, 1 favorite, 1 event; 19 replays')
    # Independent request keys are serialized and rejected as duplicate registrations.
    def attempt(_):
        p=dict(payload,requestKey=str(uuid.uuid4()),target={'type':'existing','targetId':target})
        p.pop('profile')
        try: sql("select public.gateway_create_favorite('"+actor+"',"+literal(p)+");")
        except RuntimeError as e:
            assert 'ALREADY_REGISTERED' in str(e)
            return True
        raise AssertionError('duplicate succeeded')
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        assert all(pool.map(attempt,range(20)))
    print('PASS: 20 different keys for one participant/target -> all ALREADY_REGISTERED')
finally:
    sql("begin; delete from app_private.favorites where participant_id in(select id from app_private.participants where identity_id='"+actor+"'); delete from app_private.targets where name='동시성 검증 코스'; delete from app_private.participants where identity_id='"+actor+"'; delete from app_private.commands where actor_id='"+actor+"'; delete from app_private.browser_identities where id='"+actor+"'; commit;")
