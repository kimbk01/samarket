BEGIN;

DO $$
DECLARE
  c1 uuid := '11111111-1111-4111-8111-111111111111';
  c2 uuid := '22222222-2222-4222-8222-222222222222';
  a1 uuid := '33333333-3333-4333-8333-333333333333';
  p1 uuid := '44444444-4444-4444-8444-444444444444';
  p2 uuid := '55555555-5555-4555-8555-555555555555';
  winner jsonb;
  zero jsonb;
  leak jsonb;
  admin_uid uuid;
  n int;
BEGIN
  -- malformed targeting
  BEGIN
    INSERT INTO public.intro_campaigns (id, name, targeting)
    VALUES (c1, 'bad-targeting', '{"audiences":["UNKNOWN"],"platforms":[],"deviceClasses":[]}'::jsonb);
    RAISE EXCEPTION 'expected targeting reject';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO public.intro_assets (id, kind, storage_path, public_url, decode_status)
  VALUES (
    a1, 'image',
    '_admin/startup/product/mobile/phase1-contract.webp',
    'https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/admin-notification-campaign-images/_admin/startup/product/mobile/phase1-contract.webp',
    'ready'
  );

  INSERT INTO public.intro_campaigns (id, name, status, priority, starts_at, targeting, requires_admin_confirmation)
  VALUES (
    c1, 'winner-high', 'active', 20, '2026-01-02T00:00:00Z',
    '{"audiences":[],"platforms":["android"],"deviceClasses":[]}'::jsonb,
    false
  );

  INSERT INTO public.intro_campaigns (id, name, status, priority, starts_at, targeting, requires_admin_confirmation)
  VALUES (
    c2, 'winner-low', 'active', 20, '2026-01-01T00:00:00Z',
    '{"audiences":[],"platforms":["android"],"deviceClasses":[]}'::jsonb,
    false
  );

  INSERT INTO public.intro_scenes (
    campaign_id, sort_order, name, advance_mode, duration_ms, layers, background_asset_id
  ) VALUES (
    c1, 0, 's1', 'timer', 2000,
    jsonb_build_array(jsonb_build_object(
      'id','hero','type','IMAGE','zIndex',1,'anchor','center','widthPct',100,'assetId', a1::text
    )),
    a1
  );

  -- TIMER 0 reject
  BEGIN
    INSERT INTO public.intro_scenes (
      campaign_id, sort_order, name, advance_mode, duration_ms, layers
    ) VALUES (
      c1, 1, 'bad-timer', 'timer', 0,
      jsonb_build_array(jsonb_build_object(
        'id','x','type','IMAGE','zIndex',1,'anchor','center','assetId', a1::text
      ))
    );
    RAISE EXCEPTION 'expected timer 0 reject';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO public.intro_scenes (
    campaign_id, sort_order, name, advance_mode, duration_ms, layers, background_asset_id
  ) VALUES (
    c2, 0, 's2', 'timer', 2000,
    jsonb_build_array(jsonb_build_object(
      'id','hero','type','IMAGE','zIndex',1,'anchor','center','widthPct',100,'assetId', a1::text
    )),
    a1
  );

  INSERT INTO public.intro_publications (id, campaign_id, revision, manifest, is_live)
  VALUES (
    p1, c1, 1,
    public.intro_v2_build_manifest(c1, p1, 1),
    true
  );
  INSERT INTO public.intro_publications (id, campaign_id, revision, manifest, is_live)
  VALUES (
    p2, c2, 1,
    public.intro_v2_build_manifest(c2, p2, 1),
    true
  );

  -- publication immutability
  BEGIN
    UPDATE public.intro_publications SET revision = 99 WHERE id = p1;
    RAISE EXCEPTION 'expected immutable revision';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  winner := public.get_intro_published_manifest(
    '2026-06-01T00:00:00Z'::timestamptz, 'guest', 'android', 'PHONE_ANDROID', true
  );
  IF winner->>'publicationId' IS DISTINCT FROM p2::text THEN
    RAISE EXCEPTION 'deterministic winner failed: %', winner;
  END IF;

  zero := public.get_intro_published_manifest(
    '2026-06-01T00:00:00Z'::timestamptz, 'guest', 'ios', 'PHONE_IOS', true
  );
  IF jsonb_typeof(zero->'campaign') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'zero intro failed: %', zero;
  END IF;

  -- draft campaign must not be served
  UPDATE public.intro_campaigns SET name = 'DRAFT-LEAK-NAME' WHERE id = c2;
  leak := public.get_intro_published_manifest(
    '2026-06-01T00:00:00Z'::timestamptz, 'guest', 'android', 'PHONE_ANDROID', true
  );
  IF leak #>> '{campaign,name}' = 'DRAFT-LEAK-NAME' THEN
    RAISE EXCEPTION 'draft leaked into published manifest';
  END IF;
  IF leak #>> '{campaign,name}' IS DISTINCT FROM 'winner-low' THEN
    RAISE EXCEPTION 'published snapshot mutated by draft edit: %', leak;
  END IF;

  SELECT user_id INTO admin_uid
  FROM public.admin_memberships
  WHERE status = 'active'
  LIMIT 1;

  BEGIN
    PERFORM set_config('role', 'anon', true);
    SELECT count(*) INTO n FROM public.intro_campaigns;
    IF n <> 0 THEN
      RAISE EXCEPTION 'anon saw % draft campaigns', n;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    n := 0;
  END;
  PERFORM set_config('role', 'none', true);

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000099', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}', true);
  SELECT count(*) INTO n FROM public.intro_campaigns;
  IF n <> 0 THEN
    RAISE EXCEPTION 'normal user saw % draft campaigns', n;
  END IF;
  PERFORM set_config('role', 'none', true);

  IF admin_uid IS NOT NULL THEN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', admin_uid::text, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', admin_uid, 'role', 'authenticated')::text,
      true
    );
    SELECT count(*) INTO n FROM public.intro_campaigns WHERE id IN (c1, c2);
    IF n < 2 THEN
      RAISE EXCEPTION 'admin did not see contract campaigns: %', n;
    END IF;
    PERFORM set_config('role', 'none', true);
  END IF;
END
$$;

ROLLBACK;
