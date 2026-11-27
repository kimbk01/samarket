-- 고객 문의 최종 감사 L13 데이터 정리 — **운영 DB 쓰기 승인 전 실행 금지** (AGENTS.md 개발 프로세스 2번 · 허위 보고 금지 8번)
-- 근거: final-audit.md §2 L13 — 옛 경로가 어드민 알림 종류를 회원 알림함 표(notification_events)에 쓴 행 45건
--       (2026-09-02~10-04, 전부 읽음 · 2026-11-28 읽기 전용 조회: support_case_created 27 · support_case_assigned 12 · support_customer_replied 6).
--       지금 어드민 알림은 admin_notifications 에만 쓴다(R13) — 이 행들은 어느 화면도 읽지 않는 찌꺼기다.
-- 실행: 아래를 한 번에 붙여 실행 → 백업 결과를 보고서에 붙임 → 개수 확인이 통과하면 commit (다르면 예외로 자동 rollback 후 보고).
-- 되돌리기: 백업 select 결과(전 열)로 insert. 행은 전부 읽음 상태라 화면·배지 숫자에는 영향 없음.

begin;
set local statement_timeout = '30s';

-- 1) 백업 — 같은 트랜잭션 안에서 전 열을 읽어 둔다(결과를 보고서에 첨부)
select *
  from public.notification_events
 where type in ('support_case_created', 'support_case_assigned', 'support_customer_replied')
 order by created_at;                                                            -- 예상 45행

-- 2) 개수 확인 — 예상과 다르거나 안 읽은 행이 섞였으면 중단(예외 → 트랜잭션 전체 rollback)
do $guard$
declare
  v_total integer;
  v_unread integer;
begin
  select count(*), count(*) filter (where unread)
    into v_total, v_unread
    from public.notification_events
   where type in ('support_case_created', 'support_case_assigned', 'support_customer_replied');
  if v_total <> 45 then
    raise exception 'L13 guard: expected 45 rows, found %', v_total;
  end if;
  if v_unread <> 0 then
    raise exception 'L13 guard: expected 0 unread rows, found %', v_unread;
  end if;
end
$guard$;

-- 3) 삭제 (고객용 종류 support_admin_replied · support_case_resolved · support_case_reopened 는 건드리지 않는다)
delete from public.notification_events
 where type in ('support_case_created', 'support_case_assigned', 'support_customer_replied')
   and unread = false;                                                           -- 예상 45

-- 4) 확인 후 commit; (다르면 rollback;)
