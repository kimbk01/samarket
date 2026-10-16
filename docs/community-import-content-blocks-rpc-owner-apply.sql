-- ============================================================================================
-- DIBAY community import — OWNER-run production apply (Supabase Dashboard → SQL Editor → paste all → Run)
-- Project: ckdosyydvgzqwpbwuhon
-- What: community_import_publish also writes community_posts.content_blocks (structured body of
--       imported posts). Logic is otherwise identical to the production function (diffed 2026-10-16).
-- Why the Owner runs it: the function body contains `delete` (image rows of the one post being
--       updated), so the Supabase MCP asks for a confirmation the Claude cloud session cannot answer.
-- Already applied by MCP 2026-10-16: the content_blocks column + its check constraint
--       (schema_migrations 20261016113538). This script only replaces the function.
-- Function body below is byte-identical to supabase/migrations/20270505131000_community_posts_import_content_blocks.sql.
-- Whole script = ONE transaction; any failed check rolls everything back. No table rows are written.
-- Rollback: docs/community-import-content-blocks-rpc-owner-rollback.sql
-- ============================================================================================
begin;

-- PRE-CHECK: stop unless production is exactly in the reviewed state (read 2026-10-16 11:36 UTC)
do $pre$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'community_posts' and column_name = 'content_blocks') <> 1 then
    raise exception 'STOP: community_posts.content_blocks is missing (apply the column migration first)';
  end if;
  if md5(pg_get_functiondef('public.community_import_publish(jsonb)'::regprocedure)) <> '30629547f5eb68d318c38c3388394c67' then
    raise exception 'STOP: community_import_publish differs from the reviewed production version';
  end if;
end
$pre$;

-- ===== BEGIN FUNCTION (verbatim from the migration) =====
create or replace function public.community_import_publish(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text := coalesce(p->>'mode', 'create');
  v_site text := p->>'source_site';
  v_board text := p->>'source_board';
  v_key text := p->>'source_article_key';
  v_post jsonb := p->'post';
  v_link public.community_import_post_links%rowtype;
  v_post_id uuid;
  v_images jsonb;
begin
  if v_site is null or v_board is null or v_key is null or v_post is null then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;
  if coalesce(v_post->>'title', '') = '' or coalesce(v_post->>'content', '') = '' then
    raise exception 'empty_content' using errcode = 'P0001';
  end if;

  -- Feed `images` column is derived from image_rows (same order) so both stores can never diverge.
  select coalesce(jsonb_agg(x.image_url order by coalesce(x.sort_order, 0)), '[]'::jsonb) into v_images
  from jsonb_to_recordset(coalesce(p->'image_rows', '[]'::jsonb)) as x(image_url text, storage_path text, sort_order int)
  where coalesce(x.image_url, '') <> '';

  select * into v_link from public.community_import_post_links
  where source_site = v_site and source_board = v_board and source_article_key = v_key
  for update;

  if v_mode = 'create' then
    if found then
      raise exception 'already_published:%', v_link.post_id using errcode = 'P0001';
    end if;
    -- Same original already on the community under another key: a legacy import (no provenance row)
    -- or the same article collected through a second board. Never create a second public post.
    if coalesce(v_post->>'public_attribution_url', '') <> '' then
      select id into v_post_id from public.community_posts
      where origin_kind = 'imported' and status <> 'deleted'
        and public_attribution_url = v_post->>'public_attribution_url'
      limit 1;
      if found then
        raise exception 'published_under_other_key:%', v_post_id using errcode = 'P0001';
      end if;
    end if;
    insert into public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, category,
      images, is_question, is_meetup, meetup_place, meetup_date, status, is_sample_data, origin_kind,
      display_author_name, display_author_avatar_url, display_date, public_attribution_name, public_attribution_url,
      content_blocks
    ) values (
      (v_post->>'user_id')::uuid, (v_post->>'section_id')::uuid, v_post->>'section_slug',
      (v_post->>'topic_id')::uuid, v_post->>'topic_slug', v_post->>'title', v_post->>'content', v_post->>'summary',
      v_post->>'region_label', v_post->>'category', v_images, false, false, null, null,
      'active', false, 'imported', v_post->>'display_author_name', null, nullif(v_post->>'display_date', '')::timestamptz,
      v_post->>'public_attribution_name', v_post->>'public_attribution_url',
      case when jsonb_typeof(v_post->'content_blocks') = 'array' then v_post->'content_blocks' else null end
    ) returning id into v_post_id;

    insert into public.community_import_post_links
      (source_site, source_board, source_article_key, post_id, canonical_url, content_hash, content_policy, published_by)
    values
      (v_site, v_board, v_key, v_post_id, coalesce(p->>'canonical_url', ''), coalesce(p->>'content_hash', ''),
       coalesce(p->>'content_policy', 'summary_link'), nullif(p->>'actor_id', '')::uuid);
  elsif v_mode = 'update' then
    if not found then
      raise exception 'not_published' using errcode = 'P0001';
    end if;
    v_post_id := v_link.post_id;
    update public.community_posts set
      topic_id = (v_post->>'topic_id')::uuid,
      topic_slug = v_post->>'topic_slug',
      title = v_post->>'title',
      content = v_post->>'content',
      summary = v_post->>'summary',
      category = v_post->>'category',
      images = v_images,
      display_author_name = v_post->>'display_author_name',
      display_date = nullif(v_post->>'display_date', '')::timestamptz,
      public_attribution_name = v_post->>'public_attribution_name',
      public_attribution_url = v_post->>'public_attribution_url',
      content_blocks = case when jsonb_typeof(v_post->'content_blocks') = 'array' then v_post->'content_blocks' else null end,
      updated_at = now()
    where id = v_post_id and origin_kind = 'imported';
    if not found then
      raise exception 'post_missing:%', v_post_id using errcode = 'P0001';
    end if;
    -- Replace this one imported post's image rows. Scope: the single post_id taken from the locked
    -- provenance link (unique per post) and confirmed origin_kind='imported' above. Runs inside this
    -- function's transaction, so any later failure restores the previous rows.
    delete from public.community_post_images where post_id = v_post_id;
    update public.community_import_post_links set
      canonical_url = coalesce(p->>'canonical_url', canonical_url),
      content_hash = coalesce(p->>'content_hash', content_hash),
      content_policy = coalesce(p->>'content_policy', content_policy),
      updated_at = now()
    where id = v_link.id;
  else
    raise exception 'invalid_mode:%', v_mode using errcode = 'P0001';
  end if;

  insert into public.community_post_images (post_id, image_url, storage_path, sort_order)
  select v_post_id, x.image_url, coalesce(x.storage_path, ''), coalesce(x.sort_order, 0)
  from jsonb_to_recordset(coalesce(p->'image_rows', '[]'::jsonb)) as x(image_url text, storage_path text, sort_order int)
  where coalesce(x.image_url, '') <> '';

  if p ? 'draft' then
    insert into public.community_operator_import_drafts
      (source_site, source_board, source_article_key, canonical_url, original_json, edit_json, status, published_post_id, updated_by, updated_at)
    values
      (v_site, v_board, v_key, coalesce(p->>'canonical_url', ''), p->'draft'->'original', p->'draft'->'edit', 'published',
       v_post_id, nullif(p->>'actor_id', '')::uuid, now())
    on conflict (source_site, source_board, source_article_key) do update set
      canonical_url = excluded.canonical_url,
      original_json = excluded.original_json,
      edit_json = excluded.edit_json,
      status = 'published',
      published_post_id = v_post_id,
      updated_by = excluded.updated_by,
      updated_at = now();
  end if;

  update public.community_operator_import_inbox
  set status = 'published', published_post_id = v_post_id, last_error = null, updated_at = now()
  where source_site = v_site and source_board = v_board and source_article_key = v_key;

  return jsonb_build_object('post_id', v_post_id, 'mode', v_mode);
end;
$$;

revoke all on function public.community_import_publish(jsonb) from public, anon, authenticated;
grant execute on function public.community_import_publish(jsonb) to service_role;

comment on function public.community_import_publish(jsonb) is
  'Operator-import publish/update in one transaction: community_posts + images + link + draft + inbox.';
-- ===== END FUNCTION =====

-- POST-CHECK: rolls everything back unless the result is exactly as expected
do $post$
begin
  if position('content_blocks' in pg_get_functiondef('public.community_import_publish(jsonb)'::regprocedure)) = 0 then
    raise exception 'STOP: new function body not in place';
  end if;
  if has_function_privilege('anon', 'public.community_import_publish(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.community_import_publish(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.community_import_publish(jsonb)', 'execute') then
    raise exception 'STOP: execute privileges are not service_role-only';
  end if;
end
$post$;

insert into supabase_migrations.schema_migrations (version, name)
values ('20270505131000', 'community_posts_import_content_blocks')
on conflict (version) do nothing;

commit;
