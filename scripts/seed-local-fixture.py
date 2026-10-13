#!/usr/bin/env python3
"""Prepare FIX-01 only in the named local Docker database; credentials stay ignored."""
import hashlib,json,os,secrets,subprocess,uuid,unicodedata
from pathlib import Path
root=Path(__file__).resolve().parent.parent
container='supabase_db_it-center-food-map'
manifest={'teams':{},'categories':{},'targets':{},'participants':{},'favorites':{}}
def normalize_name(value):
 return unicodedata.normalize('NFC', value.strip()).lower()
rows=['begin;']
for i,name in enumerate(['A팀','B팀','C팀'],1):
 ident=f'10000000-0000-4000-8000-{i:012d}';manifest['teams'][name]=ident
 rows.append(f"insert into app_private.teams(id,name,normalized_name) values('{ident}','{name}','{normalize_name(name)}') on conflict(id) do update set name=excluded.name,normalized_name=excluded.normalized_name,selectable=true;")
for i,name in enumerate(['맛집','카페','산책'],1):manifest['categories'][name]=f'20000000-0000-4000-8000-{i:012d}'
for i in range(1,4):
 ident=f'30000000-0000-4000-8000-{i:012d}';manifest['targets'][f'L{i}']=ident
 rows.append(f"insert into app_private.targets(id,kind,name,provider,place_id,address,lng,lat) values('{ident}','PLACE','L{i} 테스트 장소','kakao','LOCAL-FIX-{i}','테스트 주소',127.0+{i}*0.001,37.0+{i}*0.001) on conflict(id) do nothing;")
relations=[('A팀','L1','카페'),('A팀','L1','카페'),('B팀','L1','카페'),('A팀','L1','맛집'),('A팀','L2','카페'),('C팀','L2','카페'),('C팀','L2','카페'),('C팀','L3','카페'),('C팀','L3','카페')]
private=root/'.env.qa.participants.local'
existing=dict(line.split('=',1) for line in private.read_text().splitlines() if '=' in line) if private.exists() else {}
tokens=[]
for i,(team,target,category) in enumerate(relations,1):
 token=existing.get(f'QA_U{i}_TOKEN') or secrets.token_urlsafe(32);tokens.append(f'QA_U{i}_TOKEN={token}')
 identity=f'40000000-0000-4000-8000-{i:012d}';participant=f'50000000-0000-4000-8000-{i:012d}';favorite=f'60000000-0000-4000-8000-{i:012d}'
 manifest['participants'][f'U{i}']=participant;manifest['favorites'][f'U{i}']=favorite
 rows.append(f"insert into app_private.browser_identities(id,token_hash) values('{identity}','{hashlib.sha256(token.encode()).hexdigest()}') on conflict(id) do nothing;")
 rows.append(f"insert into app_private.participants(id,identity_id,nickname,team_id) values('{participant}','{identity}','U{i}','{manifest['teams'][team]}') on conflict(id) do nothing;")
 rows.append(f"insert into app_private.favorites(id,participant_id,target_id,category_id,kind,message,created_at) values('{favorite}','{participant}','{manifest['targets'][target]}','{manifest['categories'][category]}','PLACE','U{i} 추천해요',now()-interval '{10-i} days') on conflict(id) do nothing;")
rows.append("update app_private.app_state set revision=revision+1,updated_at=now() where id=1; commit;")
result=subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input='\n'.join(rows),text=True,capture_output=True)
if result.returncode:raise RuntimeError('Local fixture SQL failed: '+result.stderr)
private.write_text('\n'.join(tokens)+'\n');os.chmod(private,0o600)
(root/'artifacts').mkdir(exist_ok=True);(root/'artifacts/qa-fixture.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('FIX-01 prepared locally: L1 total4/cafe3, L2 cafe3, L3 cafe2, ranks1/1/3. Public IDs: artifacts/qa-fixture.json; private participant tokens: .env.qa.participants.local (0600).')
