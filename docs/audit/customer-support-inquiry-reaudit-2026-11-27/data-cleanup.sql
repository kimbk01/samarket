-- 고객 문의 SSOT F5·F6 기존 데이터 정리 — **운영 DB 쓰기 승인 전 실행 금지** (AGENTS.md 개발 프로세스 2번)
-- 근거: evidence.md E1(종료인데 admin_unread_count>0 6건) · E4(종료 문의의 미읽음 고객 알림 19건)
-- 실행: 백업 확인 → begin; … 예상 건수 확인 … commit;  (건수가 다르면 rollback 후 보고)

begin;

-- 백업(같은 트랜잭션 안에서 읽어 둔다 — 결과를 보고서에 붙인다)
select id, public_case_no, status, admin_unread_count from public.support_cases
 where status in ('RESOLVED','ARCHIVED') and admin_unread_count > 0;           -- 예상 6행
select e.id, e.type, e.user_id, e.display_payload->>'supportCaseId' as case_id
  from public.notification_events e
  join public.support_cases c on c.id::text = e.display_payload->>'supportCaseId'
 where e.type like 'support_%' and e.unread and c.status in ('RESOLVED','ARCHIVED');  -- 예상 19행

-- F6: 종료 문의 어드민 미읽음 0
update public.support_cases set admin_unread_count = 0
 where status in ('RESOLVED','ARCHIVED') and admin_unread_count > 0;            -- 예상 6

-- F5: 종료 문의의 고객 알림 읽음 (종료 문의 중 고객이 아직 안 읽은 답변이 있는 문의는 제외 — F3 대로 고객이 열어 읽는다)
update public.notification_events e
   set unread = false, read_at = now(), opened_at = coalesce(e.opened_at, now())
  from public.support_cases c
 where c.id::text = e.display_payload->>'supportCaseId'
   and e.type like 'support_%' and e.unread
   and c.status in ('RESOLVED','ARCHIVED')
   and c.requester_unread_count = 0;                                              -- 예상 ≤ 19

-- 확인 후 commit; (다르면 rollback;)
