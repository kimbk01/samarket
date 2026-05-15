-- Optional priority B: single DB round-trip for browse miss
-- Route calls .rpc('get_stores_browse', ...) once. Run EXPLAIN ANALYZE before prod.
-- Sketch only: audit + revoke public + grant service_role before deploy.

/*
create or replace function public.get_stores_browse(
  p_primary_slug text,
  p_sub_slug text,
  p_fetch_cap int default 120
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cat as (
    select id, slug, name
    from store_categories
    where slug = lower(trim(p_primary_slug)) and is_active = true
    limit 1
  ),
  topics as (
    select t.id, t.slug, t.name, t.sort_order
    from store_topics t
    join cat on t.store_category_id = cat.id
    where t.is_active = true
  ),
  topic_pick as (
    select id from topics
    where lower(trim(p_sub_slug)) in ('', 'all') or slug = lower(trim(p_sub_slug))
    limit 1
  ),
  stores_rows as (
    select s.*, st.slug as topic_slug, st.name as topic_name
    from stores s
    left join store_topics st on st.id = s.store_topic_id
    join cat on true
    where s.approval_status = 'approved'
      and s.is_visible = true
      and (
        s.store_category_id = cat.id
        or (s.store_category_id is null and s.business_type ilike '%' || cat.slug || '%')
      )
      and (
        lower(trim(p_sub_slug)) in ('', 'all')
        or s.store_topic_id = (select id from topic_pick)
      )
    limit p_fetch_cap
  )
  select jsonb_build_object(
    'category', (select to_jsonb(cat) from cat),
    'topics', (select coalesce(jsonb_agg(to_jsonb(topics)), '[]'::jsonb) from topics),
    'stores', (select coalesce(jsonb_agg(to_jsonb(stores_rows)), '[]'::jsonb) from stores_rows)
  );
$$;

revoke all on function public.get_stores_browse(text, text, int) from public;
grant execute on function public.get_stores_browse(text, text, int) to service_role;
*/
