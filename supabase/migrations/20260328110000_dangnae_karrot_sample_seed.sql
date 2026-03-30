-- 당근형 동네 피드 샘플 데이터 (idempotent, is_sample_data = true)
-- 전제: profiles≥1, community_sections(dongnae)·community_topics(slug) 시드됨
-- 지역: Philippines / Quezon City / Diliman|Cubao, Makati / Poblacion, Cebu / IT Park

DO $$
DECLARE
  author_id uuid;
  buddy_a uuid;
  buddy_b uuid;
  sec_id uuid;
  topic_q uuid;
  topic_i uuid;
  topic_d uuid;
  topic_m uuid;
  topic_f uuid;
  topic_j uuid;
  loc_dil uuid;
  loc_cub uuid;
  loc_mak uuid;
  loc_cep uuid;
  post_id uuid;
  meet_id uuid;
  room_id uuid;
  cnt_posts int;
  cnt_meets int;
BEGIN
  SELECT id INTO author_id FROM public.profiles ORDER BY created_at ASC NULLS LAST LIMIT 1;
  IF author_id IS NULL THEN
    RAISE NOTICE 'dangnae_karrot_sample_seed: profiles 비어 있음 — 건너뜀';
    RETURN;
  END IF;

  SELECT id INTO buddy_a FROM public.profiles ORDER BY created_at ASC NULLS LAST OFFSET 1 LIMIT 1;
  SELECT id INTO buddy_b FROM public.profiles ORDER BY created_at ASC NULLS LAST OFFSET 2 LIMIT 1;
  IF buddy_a IS NULL OR buddy_b IS NULL THEN
    RAISE NOTICE 'dangnae_karrot_sample_seed: profiles 가 3명 미만이면 모임 멤버는 호스트만 채워집니다. (가입 시드 또는 테스트 유저 추가 권장)';
  END IF;

  SELECT id INTO sec_id FROM public.community_sections WHERE slug = 'dongnae' AND COALESCE(is_active, true) LIMIT 1;
  IF sec_id IS NULL THEN
    RAISE NOTICE 'dangnae_karrot_sample_seed: dongnae 섹션 없음 — 건너뜀';
    RETURN;
  END IF;

  SELECT id INTO topic_q FROM public.community_topics WHERE section_id = sec_id AND slug = 'question' LIMIT 1;
  SELECT id INTO topic_i FROM public.community_topics WHERE section_id = sec_id AND slug = 'info' LIMIT 1;
  SELECT id INTO topic_d FROM public.community_topics WHERE section_id = sec_id AND slug = 'daily' LIMIT 1;
  SELECT id INTO topic_m FROM public.community_topics WHERE section_id = sec_id AND slug = 'meetup' LIMIT 1;
  SELECT id INTO topic_f FROM public.community_topics WHERE section_id = sec_id AND slug = 'food' LIMIT 1;
  SELECT id INTO topic_j FROM public.community_topics WHERE section_id = sec_id AND slug = 'job' LIMIT 1;

  IF topic_q IS NULL OR topic_i IS NULL OR topic_d IS NULL OR topic_m IS NULL OR topic_f IS NULL OR topic_j IS NULL THEN
    RAISE NOTICE 'dangnae_karrot_sample_seed: community_topics 누락 — 건너뜀';
    RETURN;
  END IF;

  INSERT INTO public.locations (country, city, district, name, is_active, is_sample_data)
  SELECT 'Philippines', 'Quezon City', '', 'Diliman', true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Quezon City')
      AND lower(COALESCE(district, '')) = '' AND lower(name) = lower('Diliman'));

  INSERT INTO public.locations (country, city, district, name, is_active, is_sample_data)
  SELECT 'Philippines', 'Quezon City', '', 'Cubao', true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Quezon City')
      AND lower(COALESCE(district, '')) = '' AND lower(name) = lower('Cubao'));

  INSERT INTO public.locations (country, city, district, name, is_active, is_sample_data)
  SELECT 'Philippines', 'Makati', '', 'Poblacion', true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Makati')
      AND lower(COALESCE(district, '')) = '' AND lower(name) = lower('Poblacion'));

  INSERT INTO public.locations (country, city, district, name, is_active, is_sample_data)
  SELECT 'Philippines', 'Cebu', '', 'IT Park', true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Cebu')
      AND lower(COALESCE(district, '')) = '' AND lower(name) = lower('IT Park'));

  SELECT id INTO loc_dil FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Quezon City')
      AND lower(COALESCE(district, '')) = '' AND lower(name) = lower('Diliman') LIMIT 1;
  SELECT id INTO loc_cub FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Quezon City')
      AND lower(COALESCE(district, '')) = '' AND lower(name) = lower('Cubao') LIMIT 1;
  SELECT id INTO loc_mak FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Makati')
      AND lower(COALESCE(district, '')) = '' AND lower(name) = lower('Poblacion') LIMIT 1;
  SELECT id INTO loc_cep FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Cebu')
      AND lower(COALESCE(district, '')) = '' AND lower(name) = lower('IT Park') LIMIT 1;

  IF loc_dil IS NULL OR loc_cub IS NULL OR loc_mak IS NULL OR loc_cep IS NULL THEN
    RAISE NOTICE 'dangnae_karrot_sample_seed: locations 조회 실패';
    RETURN;
  END IF;

  -- 1 question
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '딜리만 한국마트 추천 부탁드려요') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status, is_sample_data
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_q, 'question',
      '딜리만 한국마트 추천 부탁드려요', '라면·김치 종류 많은 곳 추천 받습니다.', '라면·김치 종류 많은 곳 추천 받습니다.',
      'Diliman · Quezon City', loc_dil, 'question', '[]'::jsonb,
      true, false, 'active', true
    );
  END IF;

  -- 2 info
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '쿠바오 출퇴근 시간 교통 정보') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status, is_sample_data
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_i, 'info',
      '쿠바오 출퇴근 시간 교통 정보', '오후 5~7시 차가 많이 밀려요. 우회로 참고하세요.', '오후 5~7시 차가 많이 밀려요.',
      'Cubao · Quezon City', loc_cub, 'info', '[]'::jsonb,
      false, false, 'active', true
    );
  END IF;

  -- 3 daily
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '오늘 날씨 진짜 덥네요') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status, is_sample_data
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_d, 'daily',
      '오늘 날씨 진짜 덥네요', '외출하실 분 물·양산 챙기세요.', '외출하실 분 물·양산 챙기세요.',
      'Diliman · Quezon City', loc_dil, 'daily', '[]'::jsonb,
      false, false, 'active', true
    );
  END IF;

  -- 4 food
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '마카티 한식당 후기') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status, is_sample_data
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_f, 'food',
      '마카티 한식당 후기', '가격대는 있지만 반찬 구성이 알찼어요.', '가격대는 있지만 반찬 구성이 알찼어요.',
      'Poblacion · Makati', loc_mak, 'food', '[]'::jsonb,
      false, false, 'active', true
    );
  END IF;

  -- 5 job
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '한국어 가능한 직원 구합니다') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status, is_sample_data
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_j, 'job',
      '한국어 가능한 직원 구합니다', '주말 근무 가능하신 분 연락 주세요.', '주말 근무 가능하신 분 연락 주세요.',
      'IT Park · Cebu', loc_cep, 'job', '[]'::jsonb,
      false, false, 'active', true
    );
  END IF;

  -- 6 daily
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '헬스장 어디가 좋나요?') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status, is_sample_data
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_d, 'daily',
      '헬스장 어디가 좋나요?', 'Cubao 근처 깨끗한 곳 추천 부탁드려요.', 'Cubao 근처 깨끗한 곳 추천 부탁드려요.',
      'Cubao · Quezon City', loc_cub, 'daily', '[]'::jsonb,
      false, false, 'active', true
    );
  END IF;

  -- 7 info
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '비 많이 올 예정입니다') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status, is_sample_data
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_i, 'info',
      '비 많이 올 예정입니다', '이번 주 후반부 필리핀 기상청 예보 참고하세요.', '이번 주 후반부 필리핀 기상청 예보 참고하세요.',
      'Diliman · Quezon City', loc_dil, 'info', '[]'::jsonb,
      false, false, 'active', true
    );
  END IF;

  -- 8 food
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = 'IT Park 카페 추천') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status, is_sample_data
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_f, 'food',
      'IT Park 카페 추천', '작업하기 조용한 곳 있을까요?', '작업하기 조용한 곳 있을까요?',
      'IT Park · Cebu', loc_cep, 'food', '[]'::jsonb,
      false, false, 'active', true
    );
  END IF;

  -- 9 meetup 삼겹살 + meeting + group_meeting 채팅
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '토요일 삼겹살 번개') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, meetup_place, meetup_date, status, is_sample_data
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_m, 'meetup',
      '토요일 삼겹살 번개', '가볍게 삼겹살 하실 분 모집합니다.', '가볍게 삼겹살 하실 분 모집합니다.',
      'Diliman · Quezon City', loc_dil, 'meetup', '[]'::jsonb,
      false, true, 'Diliman 한식집 인근', (now() + interval '3 days'), 'active', true
    ) RETURNING id INTO post_id;

    INSERT INTO public.meetings (
      post_id, host_user_id, title, description, location_text, meeting_date, max_members, join_policy, status, created_by, is_sample_data
    ) VALUES (
      post_id, author_id, '토요일 삼겹살 번개', '가볍게 삼겹살 하실 분 모집합니다.', 'Diliman 한식집 인근', (now() + interval '3 days'),
      12, 'open', 'open', author_id, true
    ) RETURNING id INTO meet_id;

    INSERT INTO public.meeting_members (meeting_id, user_id, role, status) VALUES
      (meet_id, author_id, 'host', 'joined');
    IF buddy_a IS NOT NULL THEN
      INSERT INTO public.meeting_members (meeting_id, user_id, role, status) VALUES (meet_id, buddy_a, 'member', 'joined');
    END IF;
    IF buddy_b IS NOT NULL THEN
      INSERT INTO public.meeting_members (meeting_id, user_id, role, status) VALUES (meet_id, buddy_b, 'member', 'joined');
    END IF;

    INSERT INTO public.chat_rooms (
      room_type, meeting_id, related_group_id, context_type, initiator_id, peer_id, request_status, participants_count, last_message_preview
    ) VALUES (
      'group_meeting', meet_id, meet_id, 'meeting', author_id, author_id, 'approved', 1, '모임 채팅 · 토요일 삼겹살 번개'
    ) RETURNING id INTO room_id;

    UPDATE public.meetings SET chat_room_id = room_id WHERE id = meet_id;

    INSERT INTO public.chat_room_participants (room_id, user_id, role_in_room, is_active, hidden, joined_at, unread_count)
    SELECT room_id, m.user_id, 'member', true, false, now(), 0
    FROM public.meeting_members m WHERE m.meeting_id = meet_id AND m.status = 'joined';

    UPDATE public.chat_rooms cr
    SET participants_count = (
      SELECT count(*)::int FROM public.chat_room_participants p
      WHERE p.room_id = cr.id AND COALESCE(p.is_active, true)
    )
    WHERE cr.id = room_id;

    BEGIN
      INSERT INTO public.chat_messages (room_id, sender_id, message_type, body)
      VALUES (room_id, NULL, 'system', '모임 채팅방이 열렸습니다. 참여한 이웃만 대화에 참여할 수 있습니다.');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'dangnae_karrot_sample_seed: chat_messages 시스템 문구 생략 — %', SQLERRM;
    END;
  END IF;

  -- 10 meetup 농구
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '일요일 농구 모임') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug, title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, meetup_place, meetup_date, status, is_sample_data
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_m, 'meetup',
      '일요일 농구 모임', '실내체육관에서 러닝맨 모드로 가볍게 뛰어요.', '실내체육관에서 가볍게 뛰어요.',
      'Cubao · Quezon City', loc_cub, 'meetup', '[]'::jsonb,
      false, true, 'Cubao 실내코트', (now() + interval '4 days'), 'active', true
    ) RETURNING id INTO post_id;

    INSERT INTO public.meetings (
      post_id, host_user_id, title, description, location_text, meeting_date, max_members, join_policy, status, created_by, is_sample_data
    ) VALUES (
      post_id, author_id, '일요일 농구 모임', '실내체육관에서 러닝맨 모드로 가볍게 뛰어요.', 'Cubao 실내코트', (now() + interval '4 days'),
      15, 'open', 'open', author_id, true
    ) RETURNING id INTO meet_id;

    INSERT INTO public.meeting_members (meeting_id, user_id, role, status) VALUES
      (meet_id, author_id, 'host', 'joined');
    IF buddy_a IS NOT NULL THEN
      INSERT INTO public.meeting_members (meeting_id, user_id, role, status) VALUES (meet_id, buddy_a, 'member', 'joined');
    END IF;
    IF buddy_b IS NOT NULL THEN
      INSERT INTO public.meeting_members (meeting_id, user_id, role, status) VALUES (meet_id, buddy_b, 'member', 'joined');
    END IF;

    INSERT INTO public.chat_rooms (
      room_type, meeting_id, related_group_id, context_type, initiator_id, peer_id, request_status, participants_count, last_message_preview
    ) VALUES (
      'group_meeting', meet_id, meet_id, 'meeting', author_id, author_id, 'approved', 1, '모임 채팅 · 일요일 농구 모임'
    ) RETURNING id INTO room_id;

    UPDATE public.meetings SET chat_room_id = room_id WHERE id = meet_id;

    INSERT INTO public.chat_room_participants (room_id, user_id, role_in_room, is_active, hidden, joined_at, unread_count)
    SELECT room_id, m.user_id, 'member', true, false, now(), 0
    FROM public.meeting_members m WHERE m.meeting_id = meet_id AND m.status = 'joined';

    UPDATE public.chat_rooms cr
    SET participants_count = (
      SELECT count(*)::int FROM public.chat_room_participants p
      WHERE p.room_id = cr.id AND COALESCE(p.is_active, true)
    )
    WHERE cr.id = room_id;

    BEGIN
      INSERT INTO public.chat_messages (room_id, sender_id, message_type, body)
      VALUES (room_id, NULL, 'system', '모임 채팅방이 열렸습니다. 참여한 이웃만 대화에 참여할 수 있습니다.');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'dangnae_karrot_sample_seed: chat_messages 시스템 문구 생략 — %', SQLERRM;
    END;
  END IF;

  SELECT count(*)::int INTO cnt_posts FROM public.community_posts WHERE is_sample_data = true;
  SELECT count(*)::int INTO cnt_meets FROM public.meetings WHERE is_sample_data = true;
  RAISE NOTICE 'dangnae_karrot_sample_seed: 완료 — 샘플 글 % 건, 모임 % 건', cnt_posts, cnt_meets;
END $$;
