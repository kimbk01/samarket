-- is_sample_data=true 로 표시된 동네/필라이프 시드·샘플 행 일괄 삭제 (실데이터만 유지)
-- FK·부가 채팅방 순서를 고려합니다. 이미 샘플이 없으면 영향 없음.

DO $$
BEGIN
  IF to_regclass('public.meetings') IS NULL OR to_regclass('public.community_posts') IS NULL THEN
    RAISE NOTICE 'purge_community_sample_data: meetings/community_posts 없음 — 건너뜀';
    RETURN;
  END IF;

  -- 모임에 묶인 채팅방 + 부가 방(linked_chat_room_id)
  CREATE TEMP TABLE tmp_sample_meeting_ids ON COMMIT DROP AS
  SELECT id FROM public.meetings WHERE is_sample_data = true;

  CREATE TEMP TABLE tmp_sample_room_ids ON COMMIT DROP AS
  SELECT DISTINCT cr.id AS room_id
  FROM public.chat_rooms cr
  WHERE cr.meeting_id IN (SELECT id FROM tmp_sample_meeting_ids)
  UNION
  SELECT DISTINCT mcr.linked_chat_room_id AS room_id
  FROM public.meeting_chat_rooms mcr
  WHERE mcr.meeting_id IN (SELECT id FROM tmp_sample_meeting_ids)
    AND mcr.linked_chat_room_id IS NOT NULL;

  IF to_regclass('public.chat_messages') IS NOT NULL AND EXISTS (SELECT 1 FROM tmp_sample_room_ids) THEN
    DELETE FROM public.chat_messages cm
    WHERE cm.room_id IN (SELECT room_id FROM tmp_sample_room_ids);
  END IF;

  IF to_regclass('public.chat_room_participants') IS NOT NULL AND EXISTS (SELECT 1 FROM tmp_sample_room_ids) THEN
    DELETE FROM public.chat_room_participants cp
    WHERE cp.room_id IN (SELECT room_id FROM tmp_sample_room_ids);
  END IF;

  IF to_regclass('public.meeting_chat_rooms') IS NOT NULL THEN
    DELETE FROM public.meeting_chat_rooms
    WHERE meeting_id IN (SELECT id FROM tmp_sample_meeting_ids);
  END IF;

  UPDATE public.meetings SET chat_room_id = NULL
  WHERE id IN (SELECT id FROM tmp_sample_meeting_ids);

  IF to_regclass('public.chat_rooms') IS NOT NULL AND EXISTS (SELECT 1 FROM tmp_sample_room_ids) THEN
    DELETE FROM public.chat_rooms cr
    WHERE cr.id IN (SELECT room_id FROM tmp_sample_room_ids);
  END IF;

  -- 필라이프 모임 신고·액션 로그 (meetings FK 가 NO ACTION 인 경우 삭제 전 정리)
  IF to_regclass('public.meeting_reports') IS NOT NULL THEN
    DELETE FROM public.meeting_reports
    WHERE meeting_id IN (SELECT id FROM tmp_sample_meeting_ids);
  END IF;
  IF to_regclass('public.meeting_action_logs') IS NOT NULL THEN
    DELETE FROM public.meeting_action_logs
    WHERE meeting_id IN (SELECT id FROM tmp_sample_meeting_ids);
  END IF;

  DELETE FROM public.meetings WHERE is_sample_data = true;

  IF to_regclass('public.community_post_likes') IS NOT NULL THEN
    DELETE FROM public.community_post_likes pl
    WHERE pl.post_id IN (SELECT id FROM public.community_posts WHERE is_sample_data = true);
  END IF;

  IF to_regclass('public.community_comments') IS NOT NULL THEN
    DELETE FROM public.community_comments c
    WHERE c.post_id IN (SELECT id FROM public.community_posts WHERE is_sample_data = true);
  END IF;

  IF to_regclass('public.community_reports') IS NOT NULL THEN
    DELETE FROM public.community_reports r
    WHERE r.target_type = 'post'
      AND EXISTS (
        SELECT 1 FROM public.community_posts p
        WHERE p.is_sample_data = true
          AND p.id::text = r.target_id::text
      );
  END IF;

  DELETE FROM public.community_posts WHERE is_sample_data = true;

  IF to_regclass('public.locations') IS NOT NULL THEN
    DELETE FROM public.locations WHERE is_sample_data = true;
  END IF;

  RAISE NOTICE 'purge_community_sample_data: 완료';
END $$;
