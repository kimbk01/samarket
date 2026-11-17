-- 진입 감사 4단계 (2026-11-17 · Owner 「설계안대로 진행」) — 팝업 진입 대기열 · 자동 닫힘 · 형태 추가.
-- 근거: docs/audit/intro-popup-entry-audit-2026-11-17.md §3 PO-2·PO-3·PO-8 (배민 실측: 한 진입에 중앙 카드 → 하단 시트 연속,
--       중앙 카드 입력 0건에서 약 10초 뒤 사라짐, 쿠폰 카드·그림 전체형·하단 목록 시트·안내 말풍선).
-- 덧붙이기만 한다: 기존 행은 기본값(optional · 자동 닫힘 없음)으로 지금과 같이 동작한다.
-- 앱 코드는 이 열이 없어도 동작한다(캠페인 행을 `*` 로 읽고 없는 열은 기본값) — 배포 순서와 무관.

alter table public.platform_popup_campaigns
  add column if not exists queue_class text not null default 'optional',
  add column if not exists auto_dismiss_seconds smallint null,
  add column if not exists cta_bg_color text null,
  add column if not exists cta_text_color text null,
  add column if not exists list_store_ids uuid[] null,
  add column if not exists tooltip_anchor text null;

alter table public.platform_popup_campaigns
  drop constraint if exists platform_popup_campaigns_queue_class_check;
alter table public.platform_popup_campaigns
  add constraint platform_popup_campaigns_queue_class_check
  check (queue_class in ('mandatory', 'optional'));

alter table public.platform_popup_campaigns
  drop constraint if exists platform_popup_campaigns_auto_dismiss_seconds_check;
alter table public.platform_popup_campaigns
  add constraint platform_popup_campaigns_auto_dismiss_seconds_check
  check (auto_dismiss_seconds is null or auto_dismiss_seconds between 3 and 60);

alter table public.platform_popup_campaigns
  drop constraint if exists platform_popup_campaigns_cta_colors_check;
alter table public.platform_popup_campaigns
  add constraint platform_popup_campaigns_cta_colors_check
  check (
    (cta_bg_color is null or cta_bg_color ~ '^#[0-9A-Fa-f]{6}$')
    and (cta_text_color is null or cta_text_color ~ '^#[0-9A-Fa-f]{6}$')
  );

alter table public.platform_popup_campaigns
  drop constraint if exists platform_popup_campaigns_tooltip_anchor_check;
alter table public.platform_popup_campaigns
  add constraint platform_popup_campaigns_tooltip_anchor_check
  check (tooltip_anchor is null or tooltip_anchor in ('region', 'notifications'));

alter table public.platform_popup_campaigns
  drop constraint if exists platform_popup_campaigns_presentation_type_check;
alter table public.platform_popup_campaigns
  add constraint platform_popup_campaigns_presentation_type_check
  check (presentation_type = any (array[
    'center_modal', 'bottom_sheet', 'benefit_dialog', 'inline_banner', 'hero_banner', 'ptr_reveal',
    'coupon_card', 'artwork_full', 'list_sheet', 'tooltip'
  ]::text[]));

comment on column public.platform_popup_campaigns.queue_class is
  '진입 대기열 구분: mandatory(공지·쿠폰 만료 등 먼저) / optional(프로모션). 진입감사 PO-2.';
comment on column public.platform_popup_campaigns.auto_dismiss_seconds is
  '자동 닫힘 초(3~60) · null = 없음. 진입감사 PO-2.';
comment on column public.platform_popup_campaigns.list_store_ids is
  'list_sheet 형태: 목록에 보일 매장 id (순서대로). 진입감사 PO-3.';
comment on column public.platform_popup_campaigns.tooltip_anchor is
  'tooltip 형태: 붙을 자리 region(지역 선택) / notifications(알림). 진입감사 PO-3.';
