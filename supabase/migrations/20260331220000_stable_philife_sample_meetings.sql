-- 필라이프/동네 모임 샘플을 dev-sample-data.ts 와 동일한 UUID 로 DB에 고정 시드합니다.
-- 적용 후 개발 환경에서 chat_rooms 행이 존재하므로 인메모리 샘플 채팅 API는 우회되고 실데이터 경로를 탑니다.
-- 관리자 모임 엔진(/api/admin/community/engine/meetings)에서 is_sample_data 로 구분·유지보수 가능합니다.

DO $$
DECLARE
  author_id uuid;
  buddy_a uuid;
  buddy_b uuid;
  sec_id uuid;
  topic_m uuid;
  loc_dil uuid;
  loc_cub uuid;
  post_sam uuid := '20000000-0000-4000-8000-000000000009'::uuid;
  post_bb uuid := '20000000-0000-4000-8000-000000000010'::uuid;
  meet_sam uuid := '30000000-0000-4000-8000-000000000001'::uuid;
  meet_bb uuid := '30000000-0000-4000-8000-000000000002'::uuid;
  room_sam uuid := '40000000-0000-4000-8000-000000000001'::uuid;
  room_bb uuid := '40000000-0000-4000-8000-000000000002'::uuid;
  room_ex uuid := '40000000-0000-4000-8000-000000000003'::uuid;
  mcr_ex uuid := '50000000-0000-4000-8000-000000000001'::uuid;
  mid_last uuid;
  now_ts timestamptz := now();
BEGIN
  IF to_regclass('public.meetings') IS NULL OR to_regclass('public.community_posts') IS NULL THEN
    RAISE NOTICE 'stable_philife_sample_meetings: meetings/community_posts 없음 — 건너뜀';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.meetings WHERE id = meet_sam) THEN
    RAISE NOTICE 'stable_philife_sample_meetings: 이미 시드됨 (meeting %)', meet_sam;
    RETURN;
  END IF;

  SELECT id INTO author_id FROM public.profiles ORDER BY created_at ASC NULLS LAST LIMIT 1;
  IF author_id IS NULL THEN
    RAISE NOTICE 'stable_philife_sample_meetings: profiles 비어 있음 — 건너뜀';
    RETURN;
  END IF;

  SELECT id INTO buddy_a FROM public.profiles ORDER BY created_at ASC NULLS LAST OFFSET 1 LIMIT 1;
  SELECT id INTO buddy_b FROM public.profiles ORDER BY created_at ASC NULLS LAST OFFSET 2 LIMIT 1;

  SELECT id INTO sec_id FROM public.community_sections WHERE slug = 'dongnae' AND COALESCE(is_active, true) LIMIT 1;
  SELECT id INTO topic_m FROM public.community_topics WHERE section_id = sec_id AND slug = 'meetup' LIMIT 1;
  SELECT id INTO loc_dil FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Quezon City')
      AND lower(COALESCE(district, '')) = '' AND lower(name) = lower('Diliman') LIMIT 1;
  SELECT id INTO loc_cub FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Quezon City')
      AND lower(COALESCE(district, '')) = '' AND lower(name) = lower('Cubao') LIMIT 1;

  IF sec_id IS NULL OR topic_m IS NULL THEN
    RAISE NOTICE 'stable_philife_sample_meetings: dongnae / meetup 주제 없음 — 건너뜀';
    RETURN;
  END IF;

  IF loc_dil IS NULL OR loc_cub IS NULL THEN
    RAISE NOTICE 'stable_philife_sample_meetings: Diliman/Cubao location 없음 — dangnae_karrot_sample_seed 선행 권장';
    RETURN;
  END IF;

  INSERT INTO public.community_posts (
    id, user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
    is_question, is_meetup, meetup_place, meetup_date, status, is_sample_data
  ) VALUES (
    post_sam, author_id, sec_id, 'dongnae', topic_m, 'meetup',
    '토요일 삼겹살 번개',
    'Quezon City · Diliman 근처에서 편하게 삼겹살 번개 모임입니다.',
    '삼겹살 번개 모임',
    'Diliman · Quezon City', loc_dil, 'meetup', '[]'::jsonb,
    false, true, 'Diliman 한식당 인근', now_ts + interval '3 days', 'active', true
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.community_posts (
    id, user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
    is_question, is_meetup, meetup_place, meetup_date, status, is_sample_data
  ) VALUES (
    post_bb, author_id, sec_id, 'dongnae', topic_m, 'meetup',
    '일요일 농구 모임',
    '실내 체육관에서 가볍게 농구하실 분 찾습니다.',
    '농구 모임',
    'Cubao · Quezon City', loc_cub, 'meetup', '[]'::jsonb,
    false, true, 'Cubao 실내코트', now_ts + interval '4 days', 'active', true
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.meetings (
    id, post_id, host_user_id, title, description, location_text, meeting_date, max_members,
    join_policy, status, created_by, is_sample_data, entry_policy, requires_approval,
    joined_count, pending_count, notice_count, last_notice_at
  ) VALUES (
    meet_sam, post_sam, author_id,
    '토요일 삼겹살 번개',
    'Quezon City · Diliman 근처에서 편하게 삼겹살 번개 모임입니다. 고기 좋아하시는 분 환영!',
    'Diliman 한식당 인근',
    now_ts + interval '3 days',
    12, 'approve', 'open', author_id, true, 'approve', true,
    3, 1, 1, '2026-03-21T09:00:00.000Z'::timestamptz
  );

  INSERT INTO public.meetings (
    id, post_id, host_user_id, title, description, location_text, meeting_date, max_members,
    join_policy, status, created_by, is_sample_data, entry_policy, requires_approval,
    joined_count, pending_count
  ) VALUES (
    meet_bb, post_bb, author_id,
    '일요일 농구 모임',
    '실내 체육관에서 가볍게 농구하실 분 찾습니다.',
    'Cubao 실내코트',
    now_ts + interval '4 days',
    15, 'open', 'open', author_id, true, 'open', false,
    3, 0
  );

  INSERT INTO public.chat_rooms (
    id, room_type, meeting_id, related_post_id, related_group_id, context_type,
    initiator_id, peer_id, request_status, participants_count, last_message_preview, created_at, updated_at
  ) VALUES (
    room_sam, 'group_meeting', meet_sam, post_sam, meet_sam, 'meeting',
    author_id, author_id, 'approved', 1,
    '삼겹살 번개 오실 분들은 간단히 인사 남겨 주세요.',
    now_ts, now_ts
  );

  INSERT INTO public.chat_rooms (
    id, room_type, meeting_id, related_post_id, related_group_id, context_type,
    initiator_id, peer_id, request_status, participants_count, last_message_preview, created_at, updated_at
  ) VALUES (
    room_bb, 'group_meeting', meet_bb, post_bb, meet_bb, 'meeting',
    author_id, author_id, 'approved', 1,
    '농구 모임은 운동화 챙겨 오세요.',
    now_ts, now_ts
  );

  UPDATE public.meetings SET chat_room_id = room_sam WHERE id = meet_sam;
  UPDATE public.meetings SET chat_room_id = room_bb WHERE id = meet_bb;

  INSERT INTO public.meeting_members (meeting_id, user_id, role, status, joined_at) VALUES
    (meet_sam, author_id, 'host', 'joined', now_ts);
  IF buddy_a IS NOT NULL THEN
    INSERT INTO public.meeting_members (meeting_id, user_id, role, status, joined_at) VALUES
      (meet_sam, buddy_a, 'member', 'joined', now_ts);
  END IF;
  IF buddy_b IS NOT NULL THEN
    INSERT INTO public.meeting_members (meeting_id, user_id, role, status, joined_at) VALUES
      (meet_sam, buddy_b, 'member', 'joined', now_ts);
  END IF;

  INSERT INTO public.meeting_members (meeting_id, user_id, role, status, joined_at) VALUES
    (meet_bb, author_id, 'host', 'joined', now_ts);
  IF buddy_a IS NOT NULL THEN
    INSERT INTO public.meeting_members (meeting_id, user_id, role, status, joined_at) VALUES
      (meet_bb, buddy_a, 'member', 'joined', now_ts);
  END IF;
  IF buddy_b IS NOT NULL THEN
    INSERT INTO public.meeting_members (meeting_id, user_id, role, status, joined_at) VALUES
      (meet_bb, buddy_b, 'member', 'joined', now_ts);
  END IF;

  INSERT INTO public.chat_room_participants (room_id, user_id, role_in_room, is_active, hidden, joined_at, unread_count)
  SELECT room_sam, m.user_id, CASE WHEN m.role = 'host' THEN 'member' ELSE 'member' END, true, false, now_ts, 0
  FROM public.meeting_members m WHERE m.meeting_id = meet_sam AND m.status = 'joined';

  INSERT INTO public.chat_room_participants (room_id, user_id, role_in_room, is_active, hidden, joined_at, unread_count)
  SELECT room_bb, m.user_id, 'member', true, false, now_ts, 0
  FROM public.meeting_members m WHERE m.meeting_id = meet_bb AND m.status = 'joined';

  UPDATE public.chat_rooms cr SET participants_count = (
    SELECT count(*)::int FROM public.chat_room_participants p
    WHERE p.room_id = cr.id AND COALESCE(p.is_active, true)
  ) WHERE cr.id IN (room_sam, room_bb);

  INSERT INTO public.chat_messages (room_id, sender_id, message_type, body, created_at)
  VALUES
    (room_sam, NULL, 'system', 'SAMarket 샘플님이 모임을 만들었습니다.', '2026-03-21T09:00:00.000Z'),
    (room_sam, author_id, 'text', '삼겹살 번개 오실 분들은 간단히 인사 남겨 주세요. 토요일 저녁 7시 Diliman 한식당 근처예요!', '2026-03-21T09:05:00.000Z'),
    (room_sam, NULL, 'system', '샘플 이웃 A님이 참여했습니다.', '2026-03-21T09:10:00.000Z'),
    (room_bb, NULL, 'system', '모임 채팅방이 열렸습니다. 참여한 이웃만 대화에 참여할 수 있습니다.', '2026-03-21T09:00:00.000Z'),
    (room_bb, author_id, 'text', '농구 모임은 운동화 챙겨 오세요.', '2026-03-21T09:10:00.000Z');

  IF buddy_a IS NOT NULL THEN
    INSERT INTO public.chat_messages (room_id, sender_id, message_type, body, created_at)
    VALUES
      (room_sam, buddy_a, 'text', '반갑습니다! 저 2명 갑니다 😊', '2026-03-21T09:12:00.000Z');
  END IF;
  IF buddy_b IS NOT NULL THEN
    INSERT INTO public.chat_messages (room_id, sender_id, message_type, body, created_at)
    VALUES
      (room_sam, buddy_b, 'text', '저도 참가할게요! 혼자인데 괜찮나요?', '2026-03-21T09:18:00.000Z'),
      (room_sam, author_id, 'text', '물론이죠! 혼자도 환영해요 😄', '2026-03-21T09:20:00.000Z');
  END IF;

  SELECT id INTO mid_last FROM public.chat_messages
  WHERE room_id = room_sam ORDER BY created_at DESC NULLS LAST LIMIT 1;
  UPDATE public.chat_rooms SET
    last_message_id = mid_last,
    last_message_at = (SELECT created_at FROM public.chat_messages WHERE id = mid_last),
    last_message_preview = left((SELECT body FROM public.chat_messages WHERE id = mid_last), 120)
  WHERE id = room_sam;

  SELECT id INTO mid_last FROM public.chat_messages
  WHERE room_id = room_bb ORDER BY created_at DESC NULLS LAST LIMIT 1;
  UPDATE public.chat_rooms SET
    last_message_id = mid_last,
    last_message_at = (SELECT created_at FROM public.chat_messages WHERE id = mid_last),
    last_message_preview = left((SELECT body FROM public.chat_messages WHERE id = mid_last), 120)
  WHERE id = room_bb;

  IF to_regclass('public.meeting_chat_rooms') IS NOT NULL THEN
    INSERT INTO public.chat_rooms (
      id, room_type, meeting_id, related_post_id, related_group_id, context_type,
      initiator_id, peer_id, request_status, participants_count, last_message_preview, created_at, updated_at
    ) VALUES (
      room_ex, 'group_meeting', meet_sam, post_sam, meet_sam, 'meeting',
      author_id, author_id, 'approved', 1,
      '2차 모임 안내 · 부가 채팅',
      now_ts, now_ts
    );

    INSERT INTO public.meeting_chat_rooms (
      id, meeting_id, title, description, room_type, is_private, linked_chat_room_id, created_by, created_at
    ) VALUES (
      mcr_ex, meet_sam, '2차 모임 안내', '장소·시간 세부 조율용 부가 채팅입니다.', 'sub', false, room_ex, author_id, now_ts
    );

    INSERT INTO public.chat_room_participants (room_id, user_id, role_in_room, is_active, hidden, joined_at, unread_count)
    SELECT room_ex, m.user_id, 'member', true, false, now_ts, 0
    FROM public.meeting_members m WHERE m.meeting_id = meet_sam AND m.status = 'joined';

    INSERT INTO public.meeting_chat_participants (room_id, user_id, role, joined_at)
    SELECT mcr_ex, m.user_id, CASE WHEN m.user_id = author_id THEN 'owner' ELSE 'member' END, now_ts
    FROM public.meeting_members m WHERE m.meeting_id = meet_sam AND m.status = 'joined';

    UPDATE public.chat_rooms cr SET participants_count = (
      SELECT count(*)::int FROM public.chat_room_participants p
      WHERE p.room_id = cr.id AND COALESCE(p.is_active, true)
    ) WHERE cr.id = room_ex;

    INSERT INTO public.chat_messages (room_id, sender_id, message_type, body, created_at)
    VALUES (room_ex, NULL, 'system', '채팅방이 생성되었습니다.', now_ts);

    SELECT id INTO mid_last FROM public.chat_messages WHERE room_id = room_ex ORDER BY created_at DESC LIMIT 1;
    UPDATE public.chat_rooms SET
      last_message_id = mid_last,
      last_message_at = (SELECT created_at FROM public.chat_messages WHERE id = mid_last),
      last_message_preview = left((SELECT body FROM public.chat_messages WHERE id = mid_last), 120)
    WHERE id = room_ex;
  END IF;

  RAISE NOTICE 'stable_philife_sample_meetings: 완료 — 모임 %, % / 부가방(있을 때) %', meet_sam, meet_bb, room_ex;
END $$;
