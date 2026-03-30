-- 참석 상태 변경 시 meeting_events 자동 기록
-- 전제: 20260329143000_philife_meeting_room_upgrade.sql 적용 후 (meeting_events·meeting_members 존재)

ALTER TABLE public.meeting_events DROP CONSTRAINT IF EXISTS meeting_events_type_check;
ALTER TABLE public.meeting_events ADD CONSTRAINT meeting_events_type_check
  CHECK (
    event_type IN (
      'join_requested',
      'join_approved',
      'join_rejected',
      'member_joined',
      'member_left',
      'member_kicked',
      'member_banned',
      'member_unbanned',
      'member_attendance_updated',
      'notice_created',
      'notice_updated',
      'notice_deleted',
      'meeting_closed',
      'meeting_reopened',
      'meeting_ended',
      'meeting_cancelled'
    )
  );

CREATE OR REPLACE FUNCTION public.log_meeting_member_attendance_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.attendance_status IS NOT DISTINCT FROM OLD.attendance_status THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, '') <> 'joined' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.meeting_events (
    meeting_id,
    actor_user_id,
    target_user_id,
    event_type,
    payload
  ) VALUES (
    NEW.meeting_id,
    NEW.attendance_checked_by,
    NEW.user_id,
    'member_attendance_updated',
    jsonb_build_object(
      'from_status', OLD.attendance_status,
      'to_status', NEW.attendance_status
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_meeting_member_attendance_event ON public.meeting_members;
CREATE TRIGGER trg_log_meeting_member_attendance_event
  AFTER UPDATE OF attendance_status ON public.meeting_members
  FOR EACH ROW
  EXECUTE FUNCTION public.log_meeting_member_attendance_event();
