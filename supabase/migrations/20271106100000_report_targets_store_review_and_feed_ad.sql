-- Apple 1.2 — 기존 신고 원장에 신고 대상 2종 추가 (새 신고 시스템 없음)
--  · store_reports.target_type += 'review'  (target_id = store_reviews.id, store_id = 리뷰의 매장)
--  · reports.target_type       += 'feed_ad' (target_id = feed_ad_campaigns.id)
-- 기존 행·값은 바꾸지 않는다. 제약 목록만 넓힌다.

begin;

alter table public.store_reports drop constraint if exists store_reports_target_type_check;
alter table public.store_reports
  add constraint store_reports_target_type_check
  check (target_type = any (array['store'::text, 'product'::text, 'review'::text]));

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (
    target_type = any (
      array['user'::text, 'product'::text, 'chat_room'::text, 'chat_message'::text, 'post'::text, 'comment'::text, 'feed_ad'::text]
    )
  );

commit;
