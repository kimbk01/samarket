-- Restore minimal, non-permissive RLS policies for core client-facing tables.
-- This follows the "deny by default" principle while keeping the app functional.
--
-- Tables covered:
-- - public.categories / public.category_settings (read)
-- - public.comments (read + own write)
-- - public.favorites (own read/write)
-- - public.posts (own write; read policy added but can be tightened later)
--
-- Safety:
-- - All operations are guarded by existence checks to avoid migration failure in partial environments.

do $$
declare
  comments_user_id_type text;
  favorites_user_id_type text;
  posts_user_id_type text;
begin
  -- -------------------------
  -- categories (public read)
  -- -------------------------
  if to_regclass('public.categories') is not null then
    execute 'alter table public.categories enable row level security';

    -- Public read: allow only active categories.
    execute 'drop policy if exists categories_public_select_active on public.categories';
    execute $sql$
      create policy categories_public_select_active
      on public.categories
      for select
      to anon, authenticated
      using (is_active = true)
    $sql$;
  end if;

  -- ---------------------------------
  -- category_settings (public read)
  -- ---------------------------------
  if to_regclass('public.category_settings') is not null then
    execute 'alter table public.category_settings enable row level security';

    execute 'drop policy if exists category_settings_public_select on public.category_settings';
    execute $sql$
      create policy category_settings_public_select
      on public.category_settings
      for select
      to anon, authenticated
      using (true)
    $sql$;
  end if;

  -- -------------------------
  -- comments (read + own write)
  -- -------------------------
  if to_regclass('public.comments') is not null then
    execute 'alter table public.comments enable row level security';

    execute 'drop policy if exists comments_public_select_visible on public.comments';
    execute $sql$
      create policy comments_public_select_visible
      on public.comments
      for select
      to anon, authenticated
      using (coalesce(hidden, false) = false)
    $sql$;

    select c.data_type
    into comments_user_id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'comments'
      and c.column_name = 'user_id';

    if comments_user_id_type is not null then
      execute 'drop policy if exists comments_insert_own on public.comments';
      if comments_user_id_type = 'uuid' then
        execute $sql$
          create policy comments_insert_own
          on public.comments
          for insert
          to authenticated
          with check (user_id = auth.uid())
        $sql$;
      else
        execute $sql$
          create policy comments_insert_own
          on public.comments
          for insert
          to authenticated
          with check (user_id = auth.uid()::text)
        $sql$;
      end if;

      execute 'drop policy if exists comments_update_own on public.comments';
      if comments_user_id_type = 'uuid' then
        execute $sql$
          create policy comments_update_own
          on public.comments
          for update
          to authenticated
          using (user_id = auth.uid())
          with check (user_id = auth.uid())
        $sql$;
      else
        execute $sql$
          create policy comments_update_own
          on public.comments
          for update
          to authenticated
          using (user_id = auth.uid()::text)
          with check (user_id = auth.uid()::text)
        $sql$;
      end if;

      execute 'drop policy if exists comments_delete_own on public.comments';
      if comments_user_id_type = 'uuid' then
        execute $sql$
          create policy comments_delete_own
          on public.comments
          for delete
          to authenticated
          using (user_id = auth.uid())
        $sql$;
      else
        execute $sql$
          create policy comments_delete_own
          on public.comments
          for delete
          to authenticated
          using (user_id = auth.uid()::text)
        $sql$;
      end if;
    end if;
  end if;

  -- -------------------------
  -- favorites (own read/write)
  -- -------------------------
  if to_regclass('public.favorites') is not null then
    execute 'alter table public.favorites enable row level security';

    select c.data_type
    into favorites_user_id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'favorites'
      and c.column_name = 'user_id';

    if favorites_user_id_type is not null then
      execute 'drop policy if exists favorites_select_own on public.favorites';
      if favorites_user_id_type = 'uuid' then
        execute $sql$
          create policy favorites_select_own
          on public.favorites
          for select
          to authenticated
          using (user_id = auth.uid())
        $sql$;
      else
        execute $sql$
          create policy favorites_select_own
          on public.favorites
          for select
          to authenticated
          using (user_id = auth.uid()::text)
        $sql$;
      end if;

      execute 'drop policy if exists favorites_insert_own on public.favorites';
      if favorites_user_id_type = 'uuid' then
        execute $sql$
          create policy favorites_insert_own
          on public.favorites
          for insert
          to authenticated
          with check (user_id = auth.uid())
        $sql$;
      else
        execute $sql$
          create policy favorites_insert_own
          on public.favorites
          for insert
          to authenticated
          with check (user_id = auth.uid()::text)
        $sql$;
      end if;

      execute 'drop policy if exists favorites_delete_own on public.favorites';
      if favorites_user_id_type = 'uuid' then
        execute $sql$
          create policy favorites_delete_own
          on public.favorites
          for delete
          to authenticated
          using (user_id = auth.uid())
        $sql$;
      else
        execute $sql$
          create policy favorites_delete_own
          on public.favorites
          for delete
          to authenticated
          using (user_id = auth.uid()::text)
        $sql$;
      end if;
    end if;
  end if;

  -- -------------------------
  -- posts (own write; read open)
  -- -------------------------
  if to_regclass('public.posts') is not null then
    execute 'alter table public.posts enable row level security';

    -- Read: allow broad read (linter intentionally does not flag SELECT USING(true)).
    -- Tighten later if posts can contain private rows.
    execute 'drop policy if exists posts_public_select on public.posts';
    execute $sql$
      create policy posts_public_select
      on public.posts
      for select
      to anon, authenticated
      using (true)
    $sql$;

    select c.data_type
    into posts_user_id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'posts'
      and c.column_name = 'user_id';

    if posts_user_id_type is not null then
      execute 'drop policy if exists posts_insert_own on public.posts';
      if posts_user_id_type = 'uuid' then
        execute $sql$
          create policy posts_insert_own
          on public.posts
          for insert
          to authenticated
          with check (user_id = auth.uid())
        $sql$;
      else
        execute $sql$
          create policy posts_insert_own
          on public.posts
          for insert
          to authenticated
          with check (user_id = auth.uid()::text)
        $sql$;
      end if;

      execute 'drop policy if exists posts_update_own on public.posts';
      if posts_user_id_type = 'uuid' then
        execute $sql$
          create policy posts_update_own
          on public.posts
          for update
          to authenticated
          using (user_id = auth.uid())
          with check (user_id = auth.uid())
        $sql$;
      else
        execute $sql$
          create policy posts_update_own
          on public.posts
          for update
          to authenticated
          using (user_id = auth.uid()::text)
          with check (user_id = auth.uid()::text)
        $sql$;
      end if;

      execute 'drop policy if exists posts_delete_own on public.posts';
      if posts_user_id_type = 'uuid' then
        execute $sql$
          create policy posts_delete_own
          on public.posts
          for delete
          to authenticated
          using (user_id = auth.uid())
        $sql$;
      else
        execute $sql$
          create policy posts_delete_own
          on public.posts
          for delete
          to authenticated
          using (user_id = auth.uid()::text)
        $sql$;
      end if;
    end if;
  end if;
end
$$;

