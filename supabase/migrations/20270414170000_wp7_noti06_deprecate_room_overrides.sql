-- WP-7 / NOTI-06 — 음소거 권위 단일화(participants.is_muted) + 테이블 폐기 표시
--
-- 감사: notification_room_overrides 는 코드 참조 0건 + 행 0건. 음소거 판단은 이미
-- community_messenger_participants.is_muted 하나가 권위다(현행 muted 4건). 혼동을 막기
-- 위해 미사용 테이블을 폐기 예정으로 표시한다(드롭은 별도 Owner 승인 — 데이터/구조 보존).

COMMENT ON TABLE public.notification_room_overrides IS
  'DEPRECATED (WP-7 NOTI-06): 미사용(코드참조 0·행 0). 음소거 권위는 community_messenger_participants.is_muted. 신규 사용 금지. 드롭은 Owner 승인 후.';
