select 'fn=' || (select count(*) from pg_proc where proname='community_import_publish')
 || ' links=' || (select count(*) from public.community_import_post_links)
 || ' inbox=' || (select string_agg(left(id::text,8)||':'||status||':'||coalesce(left(published_post_id::text,8),'-'), ' ' order by id) from public.community_operator_import_inbox)
 || ' mig=' || (select count(*) from supabase_migrations.schema_migrations where version='20270420120200');
