# Community import B+ — production release runbook

Scope: `supabase/migrations/20270420120200_community_operator_import_bplus_publish_rpc.sql` + merge of
`feat/community-import-bplus`. Already in production (applied 2026-10-04 as `20261004205401` /
`20261004205509`): B+ schema (source/board columns, post_links · rules · jobs · job_items) and seed
(25 sources, 58 boards). Nothing else in this release touches the database.

## What the migration changes (production state read 2026-10-05)

| Statement | Rows / objects touched in production |
| --- | --- |
| `insert into community_import_post_links … from community_operator_import_drafts` (backfill) | 3 rows (the 3 published drafts: philsamo/travel, philstar/headlines, cesimo/feed); table is empty today |
| `update community_operator_import_inbox` (backfill) | the matching inbox rows: 2 `new` → `published`; 1 `source_updated` keeps its status, gets `published_post_id` |
| `create or replace function community_import_publish(jsonb)` | new function (none exists today); `security definer`, `search_path = public` |
| `revoke … from public, anon, authenticated` / `grant execute … to service_role` | function is callable by the server only |

No existing post, image, member, or other table is modified by applying it. The function's only
`DELETE` is `community_post_images where post_id = <post of the locked provenance row>` during an
explicit admin **update**, inside one transaction; the post must be `origin_kind = 'imported'`.

## Pre-apply checks (read-only)

```sql
select count(*) from community_import_post_links;                                   -- expect 0
select count(*) from pg_proc where proname = 'community_import_publish';            -- expect 0
select count(*) from community_operator_import_drafts where status = 'published';   -- expect 3
```

## Post-apply verification (read-only)

```sql
select count(*) from community_import_post_links;                                   -- expect 3
select proname, prosecdef from pg_proc where proname = 'community_import_publish';  -- 1 row, true
select has_function_privilege('anon', 'community_import_publish(jsonb)', 'execute');          -- false
select has_function_privilege('authenticated', 'community_import_publish(jsonb)', 'execute'); -- false
select status, count(*) from community_operator_import_inbox where published_post_id is not null group by 1;
```

Then, from the admin screen, publish one `summary_link` article to a test-visible topic, update it
once, and confirm the post count rose by exactly 1 (see staging evidence in REPORT Q).

## Rollback

Before any B+ publish has happened (only the 3 backfilled links exist):

```sql
begin;
drop function if exists public.community_import_publish(jsonb);
delete from public.community_import_post_links
  where post_id in (select published_post_id from public.community_operator_import_drafts where status = 'published');
update public.community_operator_import_inbox i set status = 'new', published_post_id = null, updated_at = now()
  from public.community_operator_import_drafts d
  where d.status = 'published' and i.source_site = d.source_site and i.source_board = d.source_board
    and i.source_article_key = d.source_article_key and i.status = 'published';
commit;
```

After B+ publishes exist: only `drop function` (stops new publishes/updates; the app reports
`publish_rpc_missing`). Keep the link rows — they are what prevents duplicate posts. Published posts
are ordinary community posts and are hidden/unhidden from the admin inbox (bulk hide), never deleted.

App rollback: revert the merge commit on `main` (no force push) and redeploy; the cron route
`/api/cron/community-import-collect` disappears with it (it only collects into the inbox).
