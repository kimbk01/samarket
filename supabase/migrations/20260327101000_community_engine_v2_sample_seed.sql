-- 샘플 데이터 (idempotent: 동일 제목 글이 있으면 생략)
-- profiles·community_sections(dongnae)·community_topics 가 있어야 동작합니다.

DO $$
DECLARE
  author_id uuid;
  sec_id uuid;
  topic_q uuid;
  topic_i uuid;
  topic_d uuid;
  topic_m uuid;
  topic_f uuid;
  topic_j uuid;
  loc1 uuid;
  loc2 uuid;
  loc3 uuid;
  loc4 uuid;
  post_id uuid;
  meet_id uuid;
  room_id uuid;
  buddy_a uuid;
  buddy_b uuid;
BEGIN
  SELECT id INTO author_id FROM public.profiles ORDER BY created_at ASC NULLS LAST LIMIT 1;
  IF author_id IS NULL THEN
    RAISE NOTICE 'community_engine_v2_sample_seed: profiles 비어 있음 — 건너뜀';
    RETURN;
  END IF;

  SELECT id INTO sec_id FROM public.community_sections WHERE slug = 'dongnae' AND COALESCE(is_active, true) LIMIT 1;
  IF sec_id IS NULL THEN
    RAISE NOTICE 'community_engine_v2_sample_seed: dongnae 섹션 없음 — 건너뜀';
    RETURN;
  END IF;

  SELECT id INTO topic_q FROM public.community_topics WHERE section_id = sec_id AND slug = 'question' LIMIT 1;
  SELECT id INTO topic_i FROM public.community_topics WHERE section_id = sec_id AND slug = 'info' LIMIT 1;
  SELECT id INTO topic_d FROM public.community_topics WHERE section_id = sec_id AND slug = 'daily' LIMIT 1;
  SELECT id INTO topic_m FROM public.community_topics WHERE section_id = sec_id AND slug = 'meetup' LIMIT 1;
  SELECT id INTO topic_f FROM public.community_topics WHERE section_id = sec_id AND slug = 'food' LIMIT 1;
  SELECT id INTO topic_j FROM public.community_topics WHERE section_id = sec_id AND slug = 'job' LIMIT 1;

  IF topic_q IS NULL OR topic_i IS NULL OR topic_d IS NULL OR topic_m IS NULL OR topic_f IS NULL OR topic_j IS NULL THEN
    RAISE NOTICE 'community_engine_v2_sample_seed: community_topics(slug) 누락 — dongnae 시드 마이그레이션을 먼저 적용하세요.';
    RETURN;
  END IF;

  -- 추가 프로필 2명 (같은 작성자만 있으면 멤버 시드는 호스트만)
  SELECT id INTO buddy_a FROM public.profiles ORDER BY created_at ASC NULLS LAST OFFSET 1 LIMIT 1;
  SELECT id INTO buddy_b FROM public.profiles ORDER BY created_at ASC NULLS LAST OFFSET 2 LIMIT 1;

  INSERT INTO public.locations (country, city, district, name, is_active)
  SELECT 'Philippines', 'Metro Manila', 'Quezon City', 'Diliman', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations WHERE lower(city) = lower('Metro Manila') AND lower(name) = lower('Diliman')
      AND lower(COALESCE(district, '')) = lower('Quezon City'));
  INSERT INTO public.locations (country, city, district, name, is_active)
  SELECT 'Philippines', 'Metro Manila', 'Quezon City', 'Cubao', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations WHERE lower(city) = lower('Metro Manila') AND lower(name) = lower('Cubao')
      AND lower(COALESCE(district, '')) = lower('Quezon City'));
  INSERT INTO public.locations (country, city, district, name, is_active)
  SELECT 'Philippines', 'Metro Manila', 'Makati', 'Poblacion', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations WHERE lower(city) = lower('Metro Manila') AND lower(name) = lower('Poblacion')
      AND lower(COALESCE(district, '')) = lower('Makati'));
  INSERT INTO public.locations (country, city, district, name, is_active)
  SELECT 'Philippines', 'Cebu', 'Cebu City', 'IT Park', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.locations WHERE lower(city) = lower('Cebu') AND lower(name) = lower('IT Park')
      AND lower(COALESCE(district, '')) = lower('Cebu City'));

  SELECT id INTO loc1 FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Metro Manila')
      AND lower(COALESCE(district, '')) = lower('Quezon City') AND lower(name) = lower('Diliman') LIMIT 1;
  SELECT id INTO loc2 FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Metro Manila')
      AND lower(COALESCE(district, '')) = lower('Quezon City') AND lower(name) = lower('Cubao') LIMIT 1;
  SELECT id INTO loc3 FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Metro Manila')
      AND lower(COALESCE(district, '')) = lower('Makati') AND lower(name) = lower('Poblacion') LIMIT 1;
  SELECT id INTO loc4 FROM public.locations
    WHERE lower(country) = lower('Philippines') AND lower(city) = lower('Cebu')
      AND lower(COALESCE(district, '')) = lower('Cebu City') AND lower(name) = lower('IT Park') LIMIT 1;

  IF loc1 IS NULL OR loc2 IS NULL OR loc3 IS NULL OR loc4 IS NULL THEN
    RAISE NOTICE 'community_engine_v2_sample_seed: locations 조회 실패';
    RETURN;
  END IF;

  -- 1) question
  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '딜리만 근처 한국마트 추천 부탁드려요') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug,
      title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_q, 'question',
      '딜리만 근처 한국마트 추천 부탁드려요',
      '라면이랑 김치 종류 많은 곳 찾고 있어요',
      '라면이랑 김치 종류 많은 곳 찾고 있어요',
      'Diliman, Quezon City', loc1, 'question', '[]'::jsonb,
      true, false, 'active'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '쿠바오 주말 교통 많이 막힙니다') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug,
      title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_i, 'info',
      '쿠바오 주말 교통 많이 막힙니다',
      '오후 5시 이후 차 많이 밀려요',
      '오후 5시 이후 차 많이 밀려요',
      'Cubao, Quezon City', loc2, 'info', '[]'::jsonb,
      false, false, 'active'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '오늘 퀘존 날씨 갑자기 많이 덥네요') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug,
      title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_d, 'daily',
      '오늘 퀘존 날씨 갑자기 많이 덥네요',
      '외출하실 분 물 챙기세요',
      '외출하실 분 물 챙기세요',
      'Quezon City', loc1, 'daily', '[]'::jsonb,
      false, false, 'active'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '마카티 포블라시온 한식당 후기') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug,
      title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_f, 'food',
      '마카티 포블라시온 한식당 후기',
      '가격은 조금 있지만 맛은 괜찮았어요',
      '가격은 조금 있지만 맛은 괜찮았어요',
      'Poblacion, Makati', loc3, 'food', '[]'::jsonb,
      false, false, 'active'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '한국어 가능한 파트타임 구합니다') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug,
      title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_j, 'job',
      '한국어 가능한 파트타임 구합니다',
      '주말 위주로 도와주실 분 찾습니다',
      '주말 위주로 도와주실 분 찾습니다',
      'IT Park, Cebu', loc4, 'job', '[]'::jsonb,
      false, false, 'active'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '이번 주 토요일 한식 번개 모임') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug,
      title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, meetup_place, meetup_date, status
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_m, 'meetup',
      '이번 주 토요일 한식 번개 모임',
      '가볍게 만나서 식사하실 분 모집합니다',
      '가볍게 만나서 식사하실 분 모집합니다',
      'Diliman', loc1, 'meetup', '[]'::jsonb,
      false, true, 'Diliman 한식당 근처', (now() + interval '3 days'), 'active'
    ) RETURNING id INTO post_id;

    INSERT INTO public.meetings (
      post_id, host_user_id, title, description, location_text, meeting_date,
      max_members, join_policy, status, created_by
    ) VALUES (
      post_id, author_id, '이번 주 토요일 한식 번개 모임', '가볍게 만나서 식사하실 분 모집합니다',
      'Diliman 한식당 근처', (now() + interval '3 days'),
      10, 'open', 'open', author_id
    ) RETURNING id INTO meet_id;

    INSERT INTO public.meeting_members (meeting_id, user_id, role, status) VALUES
      (meet_id, author_id, 'host', 'joined');
    IF buddy_a IS NOT NULL THEN
      INSERT INTO public.meeting_members (meeting_id, user_id, role, status) VALUES
        (meet_id, buddy_a, 'member', 'joined');
    END IF;
    IF buddy_b IS NOT NULL THEN
      INSERT INTO public.meeting_members (meeting_id, user_id, role, status) VALUES
        (meet_id, buddy_b, 'member', 'joined');
    END IF;

    INSERT INTO public.chat_rooms (
      room_type, meeting_id, related_group_id, context_type,
      initiator_id, peer_id, request_status, participants_count, last_message_preview
    ) VALUES (
      'group_meeting', meet_id, meet_id, 'meeting',
      author_id, author_id, 'approved', 1, '모임 채팅 · 이번 주 토요일 한식 번개 모임'
    ) RETURNING id INTO room_id;

    UPDATE public.meetings SET chat_room_id = room_id WHERE id = meet_id;

    INSERT INTO public.chat_room_participants (room_id, user_id, role_in_room, is_active, hidden, joined_at, unread_count)
    SELECT room_id, m.user_id, 'member', true, false, now(), 0
    FROM public.meeting_members m WHERE m.meeting_id = meet_id AND m.status = 'joined';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '세부 IT파크 주변 카페 추천') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug,
      title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status
    ) VALUES (
      author_id, sec_id, 'dongnae', COALESCE(topic_i, topic_d), 'info',
      '세부 IT파크 주변 카페 추천',
      '작업하기 좋은 조용한 곳 있을까요?',
      '작업하기 좋은 조용한 곳 있을까요?',
      'IT Park', loc4, 'info', '[]'::jsonb,
      false, false, 'active'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.community_posts WHERE title = '퀘존 시티 공원 산책 하실 분') THEN
    INSERT INTO public.community_posts (
      user_id, section_id, section_slug, topic_id, topic_slug,
      title, content, summary, region_label, location_id, category, images,
      is_question, is_meetup, status
    ) VALUES (
      author_id, sec_id, 'dongnae', topic_d, 'daily',
      '퀘존 시티 공원 산책 하실 분',
      '저녁 7시쯤 가볍게 걸으실 분 구합니다',
      '저녁 7시쯤 가볍게 걸으실 분 구합니다',
      'Diliman', loc1, 'daily', '[]'::jsonb,
      false, false, 'active'
    );
  END IF;

  RAISE NOTICE 'community_engine_v2_sample_seed: 완료';
END $$;
