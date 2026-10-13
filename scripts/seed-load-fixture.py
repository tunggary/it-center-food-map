#!/usr/bin/env python3
"""Explicit test-only loader; production ref cannot be selected."""
import argparse,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--target',choices=['local','staging'],required=True);args=parser.parse_args()
query=root/'supabase/tests/load-fixture.sql'
if args.target=='local':
 r=subprocess.run(['docker','exec','-i','supabase_db_it-center-food-map','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=query.read_text(),text=True,capture_output=True)
else:
 env=os.environ.copy()
 for line in (root/'.env.staging.infrastructure.local').read_text().splitlines():
  if '=' in line:
   k,v=line.split('=',1);env[k]=v
 assert env['SUPABASE_PROJECT_REF']=='yxgmpbjcvjeacnrgtcbq','staging ref mismatch'
 r=subprocess.run(['supabase','db','query','--linked','--project-ref','yxgmpbjcvjeacnrgtcbq','--file',str(query)],cwd=root,env=env,text=True,capture_output=True)
if r.returncode:raise RuntimeError('Fixture creation failed: '+r.stderr)
print('Created test-only additional fixture: 30 teams, 10 categories, 100 participants, 1000 targets, 10000 favorites. Existing role fixtures remain; reset test project to measure exact baseline.')
