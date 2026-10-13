#!/usr/bin/env python3
"""Create local-only QA identities and catalog; never connects to a hosted project."""
import json,os,secrets,subprocess,urllib.request,urllib.error
from pathlib import Path
CONTAINER='supabase_db_it-center-food-map'
root=Path(__file__).resolve().parent.parent
status_file=root/'.env.supabase-status.local'
if not status_file.exists():
 result=subprocess.run(['supabase','status','--output','json'],cwd=root,capture_output=True,text=True,check=True)
 status_file.write_text(result.stdout);os.chmod(status_file,0o600)
status=json.loads(status_file.read_text())
base=status.get('API_URL',status.get('api_url',''))
assert base=='http://127.0.0.1:54321','Local API URL mismatch'
key=status.get('SERVICE_ROLE_KEY',status.get('service_role_key'))
assert key,'Local service role key missing'
qa_env=root/'.env.qa.local'
if qa_env.exists():
 config=dict(line.split('=',1) for line in qa_env.read_text().splitlines() if '=' in line)
 password=config['QA_ADMIN_PASSWORD']
else:
 password=secrets.token_urlsafe(24)
qa_env.write_text('QA_ADMIN_EMAIL=qa-admin@example.test\nQA_ADMIN_PASSWORD='+password+'\nQA_ORIGIN=http://localhost:5173\n');os.chmod(qa_env,0o600)
def request(path,data=None):
 req=urllib.request.Request(base+'/auth/v1/admin/'+path,data=json.dumps(data).encode() if data else None,headers={'Authorization':'Bearer '+key,'apikey':key,'Content-Type':'application/json'})
 with urllib.request.urlopen(req) as response:return json.load(response)
users=request('users')['users'];user=next((u for u in users if u.get('email')=='qa-admin@example.test'),None)
if not user:user=request('users',{'email':'qa-admin@example.test','password':password,'email_confirm':True})
query="insert into app_private.admin_users(auth_user_id,enabled) values('"+user['id']+"',true) on conflict(auth_user_id) do update set enabled=true;"
subprocess.run(['docker','exec','-i',CONTAINER,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=query,text=True,check=True,stdout=subprocess.DEVNULL)
print('Local QA admin ready. Credentials: .env.qa.local (0600). Public local catalog from supabase/seed.sql.')
