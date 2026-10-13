-- PRD's initial categories only. Actual teams and administrators are operator inputs.
do $$
declare
  inserted_count integer;
begin
  perform 1 from app_private.app_state where id = 1 for update;
  insert into app_private.categories (name, normalized_name, kind)
  values ('맛집', '맛집', 'PLACE'), ('카페', '카페', 'PLACE'), ('산책', '산책', 'COURSE')
  on conflict (kind, normalized_name) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count > 0 then
    update app_private.app_state
    set revision = revision + 1, updated_at = now()
    where id = 1;
  end if;
end
$$;
