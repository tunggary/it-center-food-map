-- Actual initial teams supplied by the operator, not QA fixture teams.
do $$
declare
  inserted_count integer;
begin
  perform 1 from app_private.app_state where id = 1 for update;
  insert into app_private.teams (name, normalized_name)
  values ('백엔드개발팀', '백엔드개발팀'), ('프론트엔드개발팀', '프론트엔드개발팀')
  on conflict (normalized_name) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count > 0 then
    update app_private.app_state
    set revision = revision + 1, updated_at = now()
    where id = 1;
  end if;
end
$$;
