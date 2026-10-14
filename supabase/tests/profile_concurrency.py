"""Real concurrent profile creation in the local database; removes only its own fixture."""
import concurrent.futures
import json
import subprocess
import uuid

def sql(query):
    result = subprocess.run(['docker', 'exec', '-i', 'supabase_db_it-center-food-map', 'psql', '-U', 'postgres', '-d', 'postgres', '-XAt', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

def literal(value):
    return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"

actor = json.loads(sql("select public.gateway_session('" + uuid.uuid4().hex + uuid.uuid4().hex + "');"))['identityId']
payload = {'requestKey': str(uuid.uuid4()), 'payloadHash': 'profile-concurrent', 'nickname': '동시 프로필 검증', 'teamId': '10000000-0000-4000-8000-000000000001'}
try:
    query = "select public.gateway_create_profile('" + actor + "'," + literal(payload) + ");"
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        results = [json.loads(r) for r in pool.map(sql, [query] * 20)]
    assert len({r['resourceId'] for r in results}) == 1
    assert sum(not r['replayed'] for r in results) == 1
    def duplicate(_):
        body = dict(payload, requestKey=str(uuid.uuid4()), nickname='덮어쓰기 금지')
        try:
            sql("select public.gateway_create_profile('" + actor + "'," + literal(body) + ");")
        except RuntimeError as error:
            assert 'VERSION_CONFLICT' in str(error)
            return True
        raise AssertionError('profile overwritten')
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        assert all(pool.map(duplicate, range(20)))
    assert json.loads(sql("select public.gateway_me('" + actor + "');"))['nickname'] == payload['nickname']
    print('PASS: 20 concurrent profile requests -> 1 profile, 19 replays; 20 different keys -> conflicts without overwrite')
finally:
    sql("begin; delete from app_private.commands where actor_id='" + actor + "'; delete from app_private.participants where identity_id='" + actor + "'; delete from app_private.browser_identities where id='" + actor + "'; commit;")
