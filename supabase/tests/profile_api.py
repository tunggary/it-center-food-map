"""Exercises the local Edge profile API and cleans up only its generated identity."""
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
assert key, 'Local publishable key missing'
token = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip('=')
token_hash = hashlib.sha256(token.encode()).hexdigest()

def request(path, method='GET', body=None, authenticated=True):
    headers = {'apikey': key, 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173'}
    if authenticated:
        headers['X-Participant-Token'] = token
    req = urllib.request.Request(base + '/functions/v1/api' + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

body = {'requestKey': str(uuid.uuid4()), 'nickname': 'API모달검증', 'teamId': '10000000-0000-4000-8000-000000000001'}
try:
    assert request('/me', 'POST', body, authenticated=False)[0] == 401
    assert request('/session', 'POST')[0] == 200
    assert request('/me')[1]['data'] is None
    assert request('/me', 'POST', dict(body, nickname=' '))[0] == 400
    assert request('/me', 'POST', dict(body, nickname='😀' * 21))[0] == 400
    assert request('/me', 'POST', dict(body, extra='rejected'))[0] == 400
    first_status, first = request('/me', 'POST', body)
    assert first_status == 201, (first_status, first)
    again_status, again = request('/me', 'POST', body)
    assert again_status == 200 and again['data']['replayed']
    assert again['data']['resourceId'] == first['data']['resourceId']
    assert request('/me', 'POST', dict(body, nickname='다른 정보'))[0] == 409
    assert request('/me', 'POST', dict(body, requestKey=str(uuid.uuid4()), nickname='덮어쓰기'))[0] == 409
    assert request('/me')[1]['data']['nickname'] == body['nickname']
    assert request('/me/favorites')[1]['data']['favorites'] == []
    print('PASS: local Edge POST /me auth, validation, 201 create, 200 replay, 409 conflict, GET /me, empty favorites')
finally:
    sql = "begin; delete from app_private.commands where actor_id in(select id from app_private.browser_identities where token_hash='" + token_hash + "'); delete from app_private.participants where identity_id in(select id from app_private.browser_identities where token_hash='" + token_hash + "'); delete from app_private.browser_identities where token_hash='" + token_hash + "'; commit;"
    subprocess.run(['docker', 'exec', '-i', 'supabase_db_it-center-food-map', 'psql', '-U', 'postgres', '-d', 'postgres', '-Xq', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, check=True, capture_output=True)
