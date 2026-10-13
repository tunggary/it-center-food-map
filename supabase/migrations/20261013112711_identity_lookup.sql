create function public.gateway_identity(p_token_hash text) returns jsonb language plpgsql security definer set search_path='' as $$declare i app_private.browser_identities;begin select * into i from app_private.browser_identities where token_hash=p_token_hash for update;if not found then perform app_private.fail('IDENTITY_REQUIRED');end if;perform app_private.require_identity(i.id);if i.last_seen_at<now()-interval '1 day' then update app_private.browser_identities set expires_at=now()+interval '180 days',last_seen_at=now() where id=i.id returning * into i;end if;return jsonb_build_object('identityId',i.id,'expiresAt',i.expires_at,'hasProfile',exists(select 1 from app_private.participants where identity_id=i.id));end$$;
revoke all on function public.gateway_identity(text) from public,anon,authenticated;
grant execute on function public.gateway_identity(text) to service_role;
grant create on schema public to foodmap_gateway;
alter function public.gateway_identity(text) owner to foodmap_gateway;
revoke create on schema public from foodmap_gateway;
-- Set timeouts before PostgREST starts its statements, not inside a running RPC.
alter role service_role set statement_timeout='1500ms';
alter role service_role set lock_timeout='1000ms';
notify pgrst,'reload config';
notify pgrst,'reload schema';
