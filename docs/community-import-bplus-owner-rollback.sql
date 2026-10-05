-- DIBAY B+ — restore the state before docs/community-import-bplus-owner-apply.sql
-- Use only while no B+ publish has happened yet (exactly the 3 backfilled link rows exist).
-- One transaction; stops without changing anything if more than the 3 reviewed links exist.
begin;
do $chk$
begin
  if (select count(*) from public.community_import_post_links) <> 3
     or (select count(*) from public.community_import_post_links where post_id not in (
          '9e794acc-f152-4260-98d2-d32d07abbd85', '2ed070f4-98a0-4467-a530-9065f99427ab', '21379aff-dda2-4d54-bf01-4d6f282d60a5')) > 0 then
    raise exception 'STOP: B+ publishes exist — drop only the function (see runbook), keep the link rows';
  end if;
end
$chk$;
drop function if exists public.community_import_publish(jsonb);
delete from public.community_import_post_links
  where post_id in ('9e794acc-f152-4260-98d2-d32d07abbd85', '2ed070f4-98a0-4467-a530-9065f99427ab', '21379aff-dda2-4d54-bf01-4d6f282d60a5');
update public.community_operator_import_inbox
  set status = case when status = 'published' then 'new' else status end, published_post_id = null, updated_at = now()
  where id in ('6dc87a9f-53d9-4f73-b02a-77cd531619c2', '00829cb7-c665-445d-9291-ae257533e1fd', 'dbc4ffc7-ad8c-4d11-9162-4e3aede50847');
delete from supabase_migrations.schema_migrations where version = '20270420120200';
commit;
