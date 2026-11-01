-- 알림 재감사 S4 D5 (Owner 승인 2026-11-02) — docs/audit/notification-full-reaudit-store-admin-2026-11-02.md §6 D5
-- 20271102020000 이 만든 notification_item_settings 는 「알림 항목 관리」 화면 제거(7db335de3) 뒤 읽는 코드가 없다.
-- 운영 2026-11-02 확인: 0행 · RLS 정책 0 · 이 표를 참조하는 함수 0.
-- Rollback: 20271102020000_notification_item_settings.sql 재적용(빈 표).

DROP TABLE IF EXISTS public.notification_item_settings;
