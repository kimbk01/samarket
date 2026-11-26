-- 광고 DB 묶음 B-DB 마무리 (Owner 「빠진 4건 진행」 2026-11-27) — 옛 5인자 배너 연장 함수 삭제
-- 설계: docs/audit/ad-db-bundle-design-2026-11-27.md B-DB FB-06 「옛 5인자 함수는 코드 배포 뒤 삭제」
-- 옛 함수는 신청 행의 기간·금액·상품을 덮어쓰고 기간을 대조하지 않는다. 코드는 이 PR 부터 `member_feed_ad_renew_v2` 만 부른다.
-- 적용 순서: 이 PR 코드가 운영에 반영된 **뒤** 적용 (반영 전 열려 있던 서버가 옛 함수를 부를 수 있음).
-- 되돌리기: docs/audit/ad-db-b-drop-old-renew-rollback-2026-11-27.sql (운영 원문 정의)
DROP FUNCTION IF EXISTS public.member_feed_ad_renew(uuid, uuid, text, text, integer);
