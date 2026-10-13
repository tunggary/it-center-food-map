#!/usr/bin/env python3
"""Idempotent Vault + free Cron configuration; requires operator DB credentials."""
import os,sys
import psycopg

def configure():
 url=os.environ['SUPABASE_URL'].rstrip('/')+'/functions/v1/maintenance'
 secret=os.environ['MAINTENANCE_SECRET']
 if not url.startswith('https://') and not url.startswith('http://127.0.0.1:'):raise ValueError('Invalid project URL')
 with psycopg.connect(os.environ['FOOD_MAP_DB_URL']) as conn:
  conn.execute('create extension if not exists pg_cron')
  conn.execute('create extension if not exists pg_net')
  existing=conn.execute("select id from vault.secrets where name='food_map_maintenance'").fetchone()
  if existing:conn.execute('select vault.update_secret(%s,%s)',(existing[0],secret))
  else:conn.execute("select vault.create_secret(%s,'food_map_maintenance','Food map cleanup caller credential')",(secret,))
  for name,schedule,reconcile in [('food-map-hourly-cleanup','0 * * * *',False),('food-map-daily-reconcile','15 2 * * *',True)]:
   endpoint=url+('?reconcile=true' if reconcile else '')
   # Stored cron command contains a Vault lookup, never the credential literal.
   literal="'"+endpoint.replace("'","''")+"'"
   command="select net.http_post(url := "+literal+", headers := jsonb_build_object('Content-Type','application/json','X-Maintenance-Secret',(select decrypted_secret from vault.decrypted_secrets where name='food_map_maintenance')), body := '{}'::jsonb);"
   conn.execute('select cron.schedule(%s,%s,%s)',(name,schedule,command))
 print('Maintenance secret stored in Vault; hourly cleanup and daily reconciliation scheduled.')
if __name__=='__main__':
 try:configure()
 except Exception as error:print('Maintenance configuration failed:',type(error).__name__,file=sys.stderr);raise SystemExit(1)
