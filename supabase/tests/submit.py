import pathlib,json,psycopg,uuid,hashlib
status=json.loads(pathlib.Path('.env.supabase-status.local').read_text());sql=pathlib.Path('supabase/migrations/20261013132251_submit_favorite_transaction.sql').read_text().replace('create function public.gateway_submit_favorite','create or replace function public.gateway_submit_favorite')
with psycopg.connect(status['DB_URL'])as c:
 c.execute(sql)
 tokenhash=hashlib.sha256(uuid.uuid4().bytes).hexdigest();i=c.execute('insert into app_private.browser_identities(token_hash) values(%s) returning id',(tokenhash,)).fetchone()[0]
 team=c.execute('select id from app_private.teams where selectable limit 1').fetchone()[0];category=c.execute("select id from app_private.categories where selectable and kind='COURSE' limit 1").fetchone()[0];key=str(uuid.uuid4())
 payload={'requestKey':key,'payloadHash':'a'*64,'target':{'type':'course','name':'submit txn isolated','points':[[127.0,37.0],[127.001,37.001]]},'categoryId':str(category),'message':'SQL transaction regression','photos':[],'profile':{'nickname':'submit test','teamId':str(team)}}
 def call(value,**extra):return c.execute('select public.gateway_submit_favorite(%s,%s,%s,%s,%s)',(tokenhash,psycopg.types.json.Jsonb(value),extra.get('identity'),extra.get('expires'),extra.get('invalid',False))).fetchone()[0]
 first=call(payload);assert first.get('data') and not first['data']['replayed'];again=call(payload);assert again['data']['resourceId']==first['data']['resourceId'] and again['data']['replayed']
 assert call({**payload,'payloadHash':'b'*64})['error']['code']=='REQUEST_KEY_CONFLICT'
 duplicate={**payload,'requestKey':str(uuid.uuid4()),'target':{'type':'existing','targetId':first['data']['targetId']}};duplicate.pop('profile');assert call(duplicate)['error']['code']=='ALREADY_REGISTERED'
 assert call({},invalid=True)['error']['code']=='VALIDATION_ERROR'
 assert c.execute('select sum(count) from app_private.rate_counters where scope=%s and key_hash=%s',('participant-command',hashlib.sha256(str(i).encode()).hexdigest())).fetchone()[0]==5
 count=c.execute('select count(*) from app_private.favorites f join app_private.participants p on p.id=f.participant_id where p.identity_id=%s',(i,)).fetchone()[0];assert count==1
 c.execute("update app_private.browser_identities set expires_at=now()-interval '1 second' where id=%s",(i,))
 try:
  with c.transaction():call(payload)
  raise AssertionError('Expired identity replay accepted')
 except psycopg.errors.RaiseException as e:assert str(e).startswith('IDENTITY_EXPIRED')
 # Failed first registration rolls back profile, course, event and command, but retains rate charge.
 second_hash=hashlib.sha256(uuid.uuid4().bytes).hexdigest();second_id=c.execute('insert into app_private.browser_identities(token_hash) values(%s) returning id',(second_hash,)).fetchone()[0]
 bad={**payload,'requestKey':str(uuid.uuid4()),'target':{**payload['target'],'name':'must rollback failed photo'},'photos':[{'assetId':str(uuid.uuid4()),'slot':1}]}
 result=c.execute('select public.gateway_submit_favorite(%s,%s)',(second_hash,psycopg.types.json.Jsonb(bad))).fetchone()[0];assert result['error']['code']=='PHOTO_GONE';assert c.execute('select count(*) from app_private.participants where identity_id=%s',(second_id,)).fetchone()[0]==0;assert c.execute("select count(*) from app_private.targets where name='must rollback failed photo'").fetchone()[0]==0
 # Place signed identity binding and expiry are validated before creating; successful replay tolerates expiry.
 place_hash=hashlib.sha256(uuid.uuid4().bytes).hexdigest();place_id=c.execute('insert into app_private.browser_identities(token_hash) values(%s) returning id',(place_hash,)).fetchone()[0];place_category=c.execute("select id from app_private.categories where kind='PLACE' and selectable limit 1").fetchone()[0]
 place={**payload,'requestKey':str(uuid.uuid4()),'categoryId':str(place_category),'target':{'type':'place','placeId':str(uuid.uuid4()),'name':'signed place test','address':'QA','lng':127.0,'lat':37.0}}
 def place_call(actor,minutes):return c.execute("select public.gateway_submit_favorite(%s,%s,%s,now()+make_interval(mins=>%s))",(place_hash,psycopg.types.json.Jsonb(place),actor,minutes)).fetchone()[0]
 assert place_call(uuid.uuid4(),30)['error']['code']=='VALIDATION_ERROR';assert place_call(place_id,-1)['error']['code']=='VALIDATION_ERROR';assert place_call(place_id,30).get('data');assert place_call(place_id,-1)['data']['replayed']
 # Invalid shapes still consume all 30 attempts, and attempt 31 is denied.
 rate_hash=hashlib.sha256(uuid.uuid4().bytes).hexdigest();rate_id=c.execute('insert into app_private.browser_identities(token_hash) values(%s) returning id',(rate_hash,)).fetchone()[0]
 for _ in range(30):assert c.execute('select public.gateway_submit_favorite(%s,%s,null,null,true)',(rate_hash,psycopg.types.json.Jsonb({}))).fetchone()[0]['error']['code']=='VALIDATION_ERROR'
 try:
  with c.transaction():c.execute('select public.gateway_submit_favorite(%s,%s,null,null,true)',(rate_hash,psycopg.types.json.Jsonb({})))
  raise AssertionError('Rate limit bypassed')
 except psycopg.errors.RaiseException as e:assert str(e).startswith('RATE_LIMITED')
 row=c.execute("select r.rolname,has_function_privilege('anon',p.oid,'EXECUTE'),has_function_privilege('authenticated',p.oid,'EXECUTE'),has_function_privilege('service_role',p.oid,'EXECUTE'),p.proconfig from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid='public.gateway_submit_favorite(text,jsonb,uuid,timestamptz,boolean)'::regprocedure").fetchone();assert row[0]=='foodmap_gateway'and row[1:4]==(False,False,True)and 'search_path=""'in row[4]
 c.rollback()
print('Submit transaction actual DB checks passed; schema/data rolled back: first profile, replay, conflicting payload, duplicate+validation rate retention, expiry, grants/owner')
