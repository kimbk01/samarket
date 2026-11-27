-- F3 회원 토큰 DB 직접 쓰기 잠금 (Owner 2026-11-27 「승인, 적용 진행」)
-- 감사: docs/audit/registration-process-contract-audit-2026-11-27.md §1 F3
-- 설계: docs/audit/f3-client-direct-write-lock-design-2026-11-27.md
-- 근거(운영 읽기 전용 조회 2026-11-27 PHT):
--   * 아래 8개 표 모두 anon·authenticated 에 INSERT·UPDATE·DELETE·TRUNCATE GRANT, 쓰기 정책은 「본인 행」만 확인.
--   * chat_room_participants INSERT 는 방 조건이 없어 아무 거래 채팅방에 자기 자신을 넣고, chat_messages SELECT/INSERT 정책을
--     통과해 남의 거래 채팅을 읽고 보낼 수 있었다. UPDATE 정책은 WITH CHECK 가 없어 참여 행의 방 옮기기·같은 방 상대 메시지 고치기 가능.
--   * 앱 쓰기 47곳은 전부 service_role 서버 클라이언트(설계 §2). 회원 토큰 쓰기 0곳. 브라우저 Realtime 은 SELECT 만.
--   * 대상 표에 쓰는 DB 함수는 sync_open_chat_chat_participant 1개(SECURITY DEFINER · 소유자 postgres · 회원 실행 권한 없음).
-- 유지: SELECT 권한·SELECT 정책(Realtime 구독). community_friend_favorites 는 ALL 정책을 같은 조건의 SELECT 정책으로 교체.
-- 재사용: public.block_client_role_direct_writes() (20270602100000) — 새 함수 0. 데이터 변경 없음.
-- 함수·DO 본문에는 비 ASCII 주석을 넣지 않는다 (운영 적용 도구가 멈춤).
-- 롤백: 설계 문서 §7 (운영 원문 그대로 GRANT·정책 복원 + 트리거 삭제).

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.chat_room_participants, public.chat_messages, public.trade_appointments,
  public.community_post_saves, public.job_applications, public.store_favorites,
  public.ad_payment_requests, public.community_friend_favorites
FROM anon, authenticated;

DROP POLICY IF EXISTS chat_room_participants_insert ON public.chat_room_participants;
DROP POLICY IF EXISTS chat_room_participants_update ON public.chat_room_participants;
DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_update ON public.chat_messages;
DROP POLICY IF EXISTS trade_appointments_insert ON public.trade_appointments;
DROP POLICY IF EXISTS trade_appointments_update ON public.trade_appointments;
DROP POLICY IF EXISTS community_post_saves_insert_own ON public.community_post_saves;
DROP POLICY IF EXISTS community_post_saves_delete_own ON public.community_post_saves;
DROP POLICY IF EXISTS job_applications_insert_own ON public.job_applications;
DROP POLICY IF EXISTS store_favorites_insert_own ON public.store_favorites;
DROP POLICY IF EXISTS store_favorites_delete_own ON public.store_favorites;
DROP POLICY IF EXISTS ad_payment_requests_insert_owner ON public.ad_payment_requests;

DROP POLICY IF EXISTS community_friend_favorites_own_policy ON public.community_friend_favorites;
DROP POLICY IF EXISTS community_friend_favorites_select_own ON public.community_friend_favorites;
CREATE POLICY community_friend_favorites_select_own ON public.community_friend_favorites
  FOR SELECT USING (auth.uid() = user_id);

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_room_participants','chat_messages','trade_appointments','community_post_saves',
                           'job_applications','store_favorites','ad_payment_requests','community_friend_favorites']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_block_client_role_writes', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes()',
                   'trg_' || t || '_block_client_role_writes', t);
  END LOOP;
END
$do$;
