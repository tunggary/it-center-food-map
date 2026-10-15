"""Local HTTP regression for optional introductions; removes only its generated data."""
import base64
import hashlib
import json
from pathlib import Path
import secrets
import subprocess
import urllib.request
import urllib.error
import uuid

root = Path(__file__).resolve().parents[2]
status = json.loads((root / '.env.supabase-status.local').read_text())
base = status.get('API_URL', status.get('api_url'))
assert base == 'http://127.0.0.1:54321', 'Only the local QA API is allowed'
key = status.get('ANON_KEY', status.get('anon_key'))
token = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip('=')
token_hash = hashlib.sha256(token.encode()).hexdigest()
created_targets = []

def request(path, method='GET', body=None):
    headers = {'apikey': key, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173', 'X-Participant-Token': token}
    req = urllib.request.Request(base + '/functions/v1/api' + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

def rpc(name, payload):
    req = urllib.request.Request(base + '/rest/v1/rpc/' + name, data=json.dumps(payload).encode(), headers={'apikey': key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)

try:
    assert request('/session', 'POST')[0] == 200
    assert request('/me', 'POST', {'requestKey': str(uuid.uuid4()), 'nickname': '소개선택검증', 'teamId': '10000000-0000-4000-8000-000000000001'})[0] == 201
    body = {'requestKey': str(uuid.uuid4()), 'target': {'type': 'course', 'name': 'optional-message-' + uuid.uuid4().hex[:12], 'points': [[127, 37], [127.001, 37.001]]}, 'categoryId': '20000000-0000-4000-8000-000000000003', 'message': '', 'photos': []}
    for value in [None, 123, '가' * 101, '👨‍👩‍👧‍👦' * 101]:
        assert request('/favorites', 'POST', dict(body, message=value))[0] == 400
    missing = {k: v for k, v in body.items() if k != 'message'}
    assert request('/favorites', 'POST', missing)[0] == 400
    code, first = request('/favorites', 'POST', body)
    assert code == 201, (code, first)
    favorite_id, target_id = first['data']['resourceId'], first['data']['targetId']
    created_targets.append(str(uuid.UUID(target_id)))
    code, replay = request('/favorites', 'POST', dict(body, message=' \n '))
    assert code == 200 and replay['data']['replayed'] and replay['data']['resourceId'] == favorite_id
    assert request('/favorites', 'POST', dict(body, message='changed'))[0] == 409
    assert request('/favorites', 'POST', dict(body, requestKey=str(uuid.uuid4()), target={'type': 'existing', 'targetId': target_id}))[0] == 409
    edit = {'requestKey': str(uuid.uuid4()), 'expectedVersion': 1, 'categoryId': body['categoryId'], 'message': '👨‍👩‍👧‍👦' * 100, 'photos': []}
    for value in [None, 123, '가' * 101]:
        assert request('/favorites/' + favorite_id, 'PATCH', dict(edit, message=value))[0] == 400
    assert request('/favorites/' + favorite_id, 'PATCH', {k: v for k, v in edit.items() if k != 'message'})[0] == 400
    assert request('/favorites/' + favorite_id, 'PATCH', edit)[0] == 200
    cleared = dict(edit, requestKey=str(uuid.uuid4()), expectedVersion=2, message=' \n ')
    assert request('/favorites/' + favorite_id, 'PATCH', cleared)[0] == 200
    assert request('/favorites/' + favorite_id, 'PATCH', cleared)[1]['data']['replayed']
    assert request('/favorites/' + favorite_id, 'PATCH', dict(cleared, requestKey=str(uuid.uuid4())))[0] == 409
    own = request('/me/favorites')[1]['data']['favorites']
    assert len(own) == 1 and own[0]['message'] == '' and own[0]['version'] == 3
    detail = rpc('read_target', {'p_target_id': target_id})
    assert detail['totalCount'] == 1 and detail['favorites'][0]['message'] == ''
    assert not rpc('read_announcement', {'p_event_revision': first['data']['revision']})['skip']
    print('PASS: local Edge optional message create, normalization, replay/conflict, 100 emoji, validation, clear, public/owner read and announcement')
finally:
    targets = ','.join("'" + t + "'::uuid" for t in created_targets)
    actor = "select id from app_private.browser_identities where token_hash='" + token_hash + "'"
    sql = "begin; delete from app_private.registration_events where favorite_id in(select id from app_private.favorites where participant_id in(select id from app_private.participants where identity_id in(" + actor + "))); delete from app_private.commands where actor_id in(" + actor + "); delete from app_private.favorites where participant_id in(select id from app_private.participants where identity_id in(" + actor + ")); delete from app_private.participants where identity_id in(" + actor + "); delete from app_private.browser_identities where token_hash='" + token_hash + "';"
    if targets:
        sql += 'delete from app_private.targets where id in(' + targets + ');'
    sql += 'commit;'
    subprocess.run(['docker', 'exec', '-i', 'supabase_db_it-center-food-map', 'psql', '-U', 'postgres', '-d', 'postgres', '-Xq', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, check=True, capture_output=True)
