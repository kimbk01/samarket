-- R7 잔여 (trade) — 거래 Admin 검색 후보 상한 제거 · 조회 전용 뷰
--
-- 목적: 「후보 id 를 N건만 먼저 찾아 in(...)」(판매자 거래글 2000건 · 후기 제목/닉네임 각 200건 · 제한 닉네임 200건)을
--       조인 열 필터로 바꾼다. 뷰는 원본 행에 조인 열만 붙인다 — 행 수·필터·정렬·페이지(range)·count 는 기존 PostgREST 조회 그대로.
-- 대상 화면:
--   · /admin/trade/reports · 판매자·구매자 상세 「신고 받은 내역」 (GET /api/admin/trade/reports?sellerId=) → admin_trade_reports_v
--   · /admin/reviews (GET /api/admin/transaction-reviews?q=)                                     → admin_transaction_reviews_search_v
--   · /admin/trade/restrictions (GET /api/admin/trade/restrictions?q=)                            → admin_trade_sanctions_v
-- 권한: security_invoker = true (호출자 권한·RLS 그대로) · PUBLIC/anon/authenticated 권한 없음 · service_role SELECT 만
--       (앱 서버가 requireTradeAdmin 가드 통과 후 service role 로 읽는다).
--
-- 롤백:
--   drop view if exists public.admin_trade_sanctions_v;
--   drop view if exists public.admin_transaction_reviews_search_v;
--   drop view if exists public.admin_trade_reports_v;

-- ── 거래 신고 + 대상 거래글 작성자 (product_id 기준 · target_id 기준 각각) ──
create or replace view public.admin_trade_reports_v
with (security_invoker = true) as
select r.id,
       r.reporter_id,
       r.target_type,
       r.target_id,
       r.room_id,
       r.product_id,
       r.reason_code,
       r.reason_text,
       r.status,
       r.admin_note,
       r.created_at,
       r.resolved_at,
       r.resolved_by,
       pp.user_id as product_post_user_id,
       tp.user_id as target_post_user_id
  from public.reports r
  left join public.posts pp on pp.id = r.product_id
  left join public.posts tp on tp.id = r.target_id;

revoke all on public.admin_trade_reports_v from public, anon, authenticated;
grant select on public.admin_trade_reports_v to service_role;

-- ── 거래 후기 + 거래글 제목 · 작성자/대상 닉네임·표시명·아이디 ──
create or replace view public.admin_transaction_reviews_search_v
with (security_invoker = true) as
select tr.id,
       tr.product_id,
       tr.room_id,
       tr.reviewer_id,
       tr.reviewee_id,
       tr.role_type,
       tr.public_review_type,
       tr.private_manner_score,
       tr.private_tags,
       tr.is_anonymous_negative,
       tr.created_at,
       tr.positive_tag_keys,
       tr.negative_tag_keys,
       tr.review_comment,
       p.title as post_title,
       rv.nickname as reviewer_nickname,
       rv.display_name as reviewer_display_name,
       rv.username as reviewer_username,
       re.nickname as reviewee_nickname,
       re.display_name as reviewee_display_name,
       re.username as reviewee_username,
       tr.room_id::text as room_id_text
  from public.transaction_reviews tr
  left join public.posts p on p.id = tr.product_id
  left join public.profiles rv on rv.id = tr.reviewer_id
  left join public.profiles re on re.id = tr.reviewee_id;

revoke all on public.admin_transaction_reviews_search_v from public, anon, authenticated;
grant select on public.admin_transaction_reviews_search_v to service_role;

-- ── 거래 경고·활동 제한 + 대상 회원 닉네임 ──
create or replace view public.admin_trade_sanctions_v
with (security_invoker = true) as
select s.id,
       s.user_id,
       s.sanction_type,
       s.restriction,
       s.start_at,
       s.end_at,
       s.reason,
       s.created_by,
       s.created_at,
       s.revoked_at,
       s.revoked_by,
       s.revoke_reason,
       s.source_report_id,
       s.scope,
       pr.nickname as user_nickname
  from public.sanctions s
  left join public.profiles pr on pr.id = s.user_id
 where s.scope = 'trade';

revoke all on public.admin_trade_sanctions_v from public, anon, authenticated;
grant select on public.admin_trade_sanctions_v to service_role;

notify pgrst, 'reload schema';
