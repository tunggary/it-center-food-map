#!/usr/bin/env python3
"""Manual encrypted DB+immutable photo backup. Never prints credentials.
Requires pg_dump/pg_restore matching server major and backup-requirements.txt.
Configuration comes from env, secrets never from command-line arguments.
"""
import argparse, datetime, getpass, hashlib, json, os, pathlib, shutil, subprocess, tarfile, tempfile, threading, time, urllib.request, urllib.parse, uuid

def digest(data): return hashlib.sha256(data).hexdigest()
def file_digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def required(name):
    v=os.environ.get(name)
    if not v:raise RuntimeError('Missing configuration: '+name)
    return v

def api(path,payload=None,method='POST'):
    request=urllib.request.Request(required('SUPABASE_URL')+'/functions/v1/api'+path,data=json.dumps(payload).encode() if payload is not None else None,method=method,headers={'Authorization':'Bearer '+required('FOOD_MAP_ADMIN_JWT'),'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=30) as r:return json.load(r)['data']

def storage(key,data=None):
    url=required('SUPABASE_URL')+'/storage/v1/object/'+('authenticated/' if data is None else '')+'photos/'+urllib.parse.quote(key,safe='/')
    secret=required('SUPABASE_SERVICE_ROLE_KEY')
    req=urllib.request.Request(url,data=data,method='GET' if data is None else 'POST',headers={'Authorization':'Bearer '+secret,'apikey':secret,'Content-Type':'image/jpeg','x-upsert':'false'})
    with urllib.request.urlopen(req,timeout=60) as r:return r.read()

def encrypt(source,target,password):
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
    from cryptography.hazmat.primitives.ciphers import Cipher,algorithms,modes
    salt=os.urandom(16);iv=os.urandom(12);key=Scrypt(salt=salt,length=32,n=2**15,r=8,p=1).derive(password.encode());enc=Cipher(algorithms.AES(key),modes.GCM(iv)).encryptor()
    with open(source,'rb') as src,open(target,'xb') as dst:
        dst.write(b'FMAP1'+salt+iv)
        for chunk in iter(lambda:src.read(1024*1024),b''):dst.write(enc.update(chunk))
        dst.write(enc.finalize());dst.write(enc.tag)
    target.chmod(0o600)

def decrypt(source,target,password):
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
    from cryptography.hazmat.primitives.ciphers import Cipher,algorithms,modes
    with open(source,'rb') as src:
        if src.read(5)!=b'FMAP1':raise RuntimeError('Invalid archive')
        salt=src.read(16);iv=src.read(12);src.seek(-16,2);tag=src.read(16);remaining=src.tell()-16-33;src.seek(33)
        key=Scrypt(salt=salt,length=32,n=2**15,r=8,p=1).derive(password.encode());dec=Cipher(algorithms.AES(key),modes.GCM(iv,tag)).decryptor()
        with open(target,'xb') as dst:
            while remaining:
                chunk=src.read(min(1024*1024,remaining));remaining-=len(chunk);dst.write(dec.update(chunk))
            dst.write(dec.finalize())

def backup():
    import psycopg
    root=pathlib.Path(required('FOOD_MAP_BACKUP_DIR')).expanduser().resolve();repo=pathlib.Path(__file__).resolve().parents[1]
    if root==repo or repo in root.parents:raise RuntimeError('Backup directory must be outside repository')
    if not shutil.which('pg_dump'):raise RuntimeError('pg_dump is required')
    required('FOOD_MAP_DB_URL');required('SUPABASE_SERVICE_ROLE_KEY');password=getpass.getpass('Archive encryption password: ')
    if len(password)<12:raise RuntimeError('Use at least 12 characters')
    root.mkdir(parents=True,exist_ok=True);root.chmod(0o700)
    run=api('/admin/backups',{'requestKey':str(uuid.uuid4())});run_id=run.get('id',run.get('runId'));lease=run.get('leaseToken',run.get('lease_token'));stop=threading.Event();failed=threading.Event()
    def pulse():
        while not stop.wait(60):
            try:api('/admin/backups/'+run_id,{'action':'heartbeat','leaseToken':lease},method='PATCH')
            except Exception:failed.set();break
    thread=threading.Thread(target=pulse,daemon=True);thread.start();error_code='OPERATOR_CANCELLED';dump=None
    def check():
        nonlocal error_code
        if failed.is_set():
            error_code='LEASE_EXPIRED';raise RuntimeError('Backup heartbeat failed; cannot complete')
    try:
        with tempfile.TemporaryDirectory(prefix='foodmap-backup-',dir=root) as temporary:
            work=pathlib.Path(temporary);manifest=[]
            with psycopg.connect(required('FOOD_MAP_DB_URL'),autocommit=True) as conn:
                # Wait for preexisting physical cleanup claims, never snapshot while a deleter can still run.
                for _ in range(60):
                    pending=conn.execute('select count(*) from app_private.cleanup_jobs where lease_until>now() and completed_at is null').fetchone()[0];conn.commit()
                    if not pending:break
                    check();time.sleep(5)
                else:raise RuntimeError('Existing cleanup lease did not quiesce')
                conn.execute('begin isolation level repeatable read read only')
                snapshot=conn.execute('select pg_export_snapshot()').fetchone()[0]
                meta=conn.execute("select now(),data_epoch::text,(select max(version) from supabase_migrations.schema_migrations) from app_private.app_state where id=1").fetchone()
                snapshot_meta={'snapshotAt':meta[0].astimezone(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'dataEpoch':meta[1],'migrationVersion':meta[2]}
                api('/admin/backups/'+run_id,{'action':'snapshot','leaseToken':lease,**snapshot_meta},method='PATCH')
                rows=conn.execute("select o.object_key,o.asset_id::text,o.variant,o.actual_bytes,o.sha256 from app_private.media_objects o join app_private.photo_assets a on a.id=o.asset_id join app_private.favorites f on f.id=a.favorite_id where a.state='attached' and o.state='stored' and o.object_key in(a.final_object_key,a.thumb_object_key) order by o.object_key").fetchall()
                env={**os.environ,'PGDATABASE':required('FOOD_MAP_DB_URL')};dump=subprocess.Popen(['pg_dump','--format=custom','--schema=app_private','--schema=public','--schema=supabase_migrations','--snapshot='+snapshot,'--no-owner','--file='+str(work/'db.dump')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                while dump.poll() is None:
                    check();time.sleep(0.5)
                if dump.returncode: error_code='DUMP_FAILED';raise RuntimeError('Database dump failed')
                check()
            for key,asset,variant,size,sha in rows:
                error_code='DEPENDENCY_UNAVAILABLE';raw=storage(key);error_code='HASH_MISMATCH'
                if len(raw)!=size or digest(raw)!=sha:raise RuntimeError('Photo size/hash mismatch')
                relative='objects/'+digest(key.encode())+'.jpg';(work/'objects').mkdir(exist_ok=True);(work/relative).write_bytes(raw)
                manifest.append({'objectKey':key,'assetId':asset,'variant':variant,'byteSize':size,'sha256':sha,'file':relative});check()
            metadata={**snapshot_meta,'objects':manifest,'dumpSha256':file_digest(work/'db.dump')};manifest_bytes=json.dumps(metadata,sort_keys=True,separators=(',',':')).encode();(work/'manifest.json').write_bytes(manifest_bytes)
            archive=work/'archive.tar';
            with tarfile.open(archive,'w') as tar:
                for p in [work/'db.dump',work/'manifest.json',work/'objects']:
                    if p.exists():tar.add(p,arcname=p.name)
            check();error_code='ENCRYPTION_FAILED';final=root/(run_id+'.fmap');partial=root/(run_id+'.partial');encrypt(archive,partial,password)
            # Verify encryption authentication and plaintext hash before publishing the file.
            verify=work/'verified.tar';decrypt(partial,verify,password)
            if file_digest(verify)!=file_digest(archive):raise RuntimeError('Encrypted archive verification failed')
            check();partial.rename(final)
            api('/admin/backups/'+run_id,{'action':'complete','leaseToken':lease,**snapshot_meta,'objectCount':len(manifest),'totalBytes':str(sum(x['byteSize'] for x in manifest)),'manifestSha256':digest(manifest_bytes),'archiveSha256':file_digest(final)},method='PATCH')
            print('Verified encrypted backup recorded:',final)
    except (Exception,KeyboardInterrupt) as error:
        if isinstance(error,KeyboardInterrupt):error_code='OPERATOR_CANCELLED'
        if dump is not None and dump.poll() is None:dump.terminate();dump.wait()
        try:api('/admin/backups/'+run_id,{'action':'fail','leaseToken':lease,'errorCode':error_code},method='PATCH')
        except Exception:pass
        raise
    finally:stop.set();thread.join(timeout=2)

def extract_archive(archive,work):
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            destination=(work/member.name).resolve()
            if work not in destination.parents or member.issym() or member.islnk():raise RuntimeError('Unsafe archive member')
        tar.extractall(work,filter='data')

def database_environment(target):
    from psycopg.conninfo import conninfo_to_dict
    config=conninfo_to_dict(target)
    names={'host':'PGHOST','hostaddr':'PGHOSTADDR','port':'PGPORT','user':'PGUSER','password':'PGPASSWORD','dbname':'PGDATABASE','sslmode':'PGSSLMODE','sslrootcert':'PGSSLROOTCERT','sslcert':'PGSSLCERT','sslkey':'PGSSLKEY','connect_timeout':'PGCONNECT_TIMEOUT','options':'PGOPTIONS','application_name':'PGAPPNAME','service':'PGSERVICE'}
    if set(config)-names.keys():raise RuntimeError('Unsupported database connection option')
    env={**os.environ,**{names[key]:value for key,value in config.items()}}
    name=config.get('dbname','postgres')
    if not name or '://' in name:raise RuntimeError('Invalid restore database name')
    return env,name

def filter_restore_list(contents):
    # Provider DEFAULT ACL owners cannot be impersonated by hosted postgres.
    # Application ACL entries remain and are verified after restoration.
    return ''.join(line for line in contents.splitlines(keepends=True) if not(' DEFAULT ACL ' in line and line.rstrip().rsplit(' ',1)[-1] not in {'postgres','foodmap_gateway'}))

def restore_security(conn):
    conn.execute(RESTORE_SECURITY_SQL.read_text())

RESTORE_SECURITY_SQL=pathlib.Path(__file__).resolve().with_name('restore-security.sql')

def restore_object(obj,raw):
    try:existing=storage(obj['objectKey'])
    except urllib.error.HTTPError as error:
        try:details=json.load(error)
        except Exception:details={}
        if error.code!=404 and not(error.code==400 and(str(details.get('statusCode'))=='404' or details.get('error')=='not_found')):raise
        existing=None
    if existing is not None:
        if len(existing)!=obj['byteSize'] or digest(existing)!=obj['sha256']:raise RuntimeError('Existing restore photo mismatch')
    else:storage(obj['objectKey'],raw)
    if digest(storage(obj['objectKey']))!=obj['sha256']:raise RuntimeError('Restored photo verification failed')

def restore(archive):
    import psycopg
    if required('FOOD_MAP_RESTORE_ALLOWED')!='non-production':raise RuntimeError('Restore requires explicit non-production configuration')
    if not shutil.which('pg_restore'):raise RuntimeError('pg_restore is required')
    target=required('FOOD_MAP_DB_URL');
    if 'gpsbnmgwowsbgclcottl' in target or 'gpsbnmgwowsbgclcottl' in required('SUPABASE_URL'):raise RuntimeError('Product project is forbidden as a restore target')
    password=getpass.getpass('Archive encryption password: ')
    with tempfile.TemporaryDirectory(prefix='foodmap-restore-') as temp:
        work=pathlib.Path(temp).resolve();plain=work/'archive.tar';decrypt(pathlib.Path(archive),plain,password)
        extract_archive(plain,work)
        manifest=json.loads((work/'manifest.json').read_bytes())
        if file_digest(work/'db.dump')!=manifest['dumpSha256']:raise RuntimeError('Dump hash mismatch')
        for obj in manifest['objects']:
            object_file=(work/obj['file']).resolve()
            if work not in object_file.parents:raise RuntimeError('Unsafe manifest path')
            raw=object_file.read_bytes()
            if len(raw)!=obj['byteSize'] or digest(raw)!=obj['sha256']:raise RuntimeError('Photo hash mismatch')
        env,database=database_environment(target)
        listing=subprocess.run(['pg_restore','--list',str(work/'db.dump')],env=env,capture_output=True,text=True)
        if listing.returncode:raise RuntimeError('Restore archive list failed')
        restore_list=work/'restore.list';restore_list.write_text(filter_restore_list(listing.stdout))
        # Roles are required by application ACL entries even when source ownership is skipped.
        with psycopg.connect(target) as conn:restore_security(conn)
        result=subprocess.run(['pg_restore','--clean','--if-exists','--no-owner','--exit-on-error','--dbname='+database,'--use-list='+str(restore_list),str(work/'db.dump')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if result.returncode:raise RuntimeError('Database restore failed')
        with psycopg.connect(target) as conn:restore_security(conn)
        for obj in manifest['objects']:
            restore_object(obj,(work/obj['file']).read_bytes())
        with psycopg.connect(target) as conn:
            restored=[x['objectKey'] for x in manifest['objects']]
            missing=conn.execute("select count(*) from app_private.photo_assets where state='attached' and not(final_object_key=any(%s) and thumb_object_key=any(%s))",(restored,restored)).fetchone()[0]
            if missing:raise RuntimeError('Attached photo missing from restore manifest')
            conn.execute("update app_private.backup_runs set status='failed',completed_at=now(),lease_token=null,lease_until=null,error_code='RESTORED' where status='running'")
            conn.execute('update app_private.cleanup_jobs set lease_token=null,lease_until=null')
            conn.execute("update app_private.photo_assets set state='deleting',lease_token=null,lease_until=null where state<>'attached'")
            conn.execute("update app_private.media_objects set state='deleted',reserved_bytes=0,released_at=now(),writer_lease_until=null where not(object_key=any(%s))",(restored,))
            conn.execute("update app_private.media_objects set state='stored',reserved_bytes=actual_bytes,writer_lease_until=null where object_key=any(%s)",(restored,))
            conn.execute('delete from app_private.admin_users')
            conn.execute('update app_private.app_state set data_epoch=gen_random_uuid() where id=1')
        print('Restored into non-production. Recreate administrators and validate identity, aggregates and photo references before opening service.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['backup','restore']);parser.add_argument('--archive');args=parser.parse_args()
    try:
        if args.action=='backup':backup()
        elif args.archive:restore(args.archive)
        else:parser.error('--archive required for restore')
    except (Exception,KeyboardInterrupt) as error:
        # Avoid exception messages/tracebacks carrying database URLs, auth headers or object URLs.
        print('Backup/restore failed:',type(error).__name__);raise SystemExit(1)
