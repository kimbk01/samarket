/**
 * 광고 3차 재감사 + 어드민 광고 SSOT 구현 (Owner 「설계안대로 진행」 2026-11-07) — 배달·도메인 어드민·문구 문구. 뒤에 spread 되므로 같은 키는 이 파일 값이 우선한다.
 */
import { DIBAY_SERVICE_BRAND as B } from "../../brand/dibay-service-brand";
export const adsImpl1107DeliveryMessages = {
  ko: {
    /* D-10 — 도메인 상위노출 시트 내부 메모 칸 */
    admin_ads_w3_internal_memo_label: "내부 메모 (운영자만 봄 · 선택)",
    admin_ads_w3_internal_memo_placeholder: "운영자끼리 남길 내용",
    admin_ads_w3_internal_memo_hint: "회원·사장님에게 보이지 않습니다. 작업 기록에만 남습니다.",
    /* D-11 — 상위노출 중인 글 숨김·삭제 귀책 선택 */
    admin_ads_w3_promotion_fault_legend: "상위노출 중입니다 · 귀책 선택 (필수)",
    admin_ads_w3_promotion_fault_note:
      "이 글에 진행 중인 상위노출이 있습니다. 숨기거나 삭제하면 상위노출도 함께 종료됩니다. 둘 중 하나라도 실패하면 둘 다 바뀌지 않습니다.",
    admin_ads_w3_promotion_fault_operator: "운영 사유 (남은 기간 환급)",
    admin_ads_w3_promotion_fault_member: "회원 사유 (환급 없음)",
    /* D-15 — 「홍보」 → 「상위노출」 (정본 용어 · 배달 「매장 홍보」 등 정상 용어 제외) */
    admin_ad_applications_title: "광고·상위노출 신청 (도메인 선택)",
    admin_menu_ads_promote_group: "게시물 상위노출 신청",
    admin_menu_ads_community_promote: `${B.FEED} 게시물 상위노출`,
    admin_comm_promo_title: "게시물 상위노출 신청",
    admin_trade_kpi_promo: "상위노출 중",
    admin_trade_dashboard_desc: "Marketplace의 게시물, 거래, 신고, 상위노출 상태를 관리합니다.",
    apple_iap_point_use_note:
      "Apple 결제로 충전한 Point는 광고·상위노출에만 사용할 수 있습니다. 상품권·매장 주문에는 사용할 수 없습니다.",
    gift_u2_detail_apple_only_note: "Apple 결제로 충전한 {apple}P는 광고·상위노출에만 사용할 수 있습니다.",
    gift_u2_err_apple_restricted:
      "보유 Point {total}P 중 이 결제에 사용할 수 있는 Point는 {usable}P입니다. Apple 결제로 충전한 Point는 광고·상위노출에만 사용할 수 있습니다.",
    /* D-18 — 한국어 문구 영어 잔여 (admin-delivery-ads.ts:239-241) */
    admin_delivery_ads_related_support_title: "관련 문의",
    admin_delivery_ads_related_support_note:
      "고객지원 문의입니다. 광고 승인·정지는 아래 운영 대화가 아니라 「광고 운영 조치」에서 처리합니다.",
    /* D-03 — 강제 종료 버튼 제거에 맞춘 안내 */
    admin_delivery_ads_schedule_no_silent_extend:
      "종료일을 늘리려면 「일정 저장」이 아니라 아래 기간 연장(유료/보상)을 사용하세요. 숨김 CTA는 없습니다 — 일시중지·종료만 지원합니다.",
  },
  en: {
    admin_ads_w3_internal_memo_label: "Internal memo (operators only · optional)",
    admin_ads_w3_internal_memo_placeholder: "Note for other operators",
    admin_ads_w3_internal_memo_hint: "Not shown to the member or owner. Kept in the activity log only.",
    admin_ads_w3_promotion_fault_legend: "Boost running · choose responsibility (required)",
    admin_ads_w3_promotion_fault_note:
      "This post has a running boost. Hiding or deleting it also ends the boost. If either fails, neither changes.",
    admin_ads_w3_promotion_fault_operator: "Operator (refund remaining period)",
    admin_ads_w3_promotion_fault_member: "Member (no refund)",
    admin_ad_applications_title: "Ad / top-exposure requests (choose domain)",
    admin_menu_ads_promote_group: "Post top-exposure requests",
    admin_menu_ads_community_promote: `${B.FEED} post top exposure`,
    admin_comm_promo_title: "Post top-exposure requests",
    admin_trade_kpi_promo: "Top exposure",
    admin_trade_dashboard_desc: "Manage marketplace listings, trades, reports, and top exposure.",
    apple_iap_point_use_note:
      "Point charged through Apple can only be used for ads and top exposure, not for gift certificates or store orders.",
    gift_u2_detail_apple_only_note: "{apple}P charged through Apple can only be used for ads and top exposure.",
    gift_u2_err_apple_restricted:
      "You have {total}P, of which {usable}P can be used for this payment. Point charged through Apple can only be used for ads and top exposure.",
    admin_delivery_ads_related_support_title: "Related Support cases",
    admin_delivery_ads_related_support_note:
      "Customer support cases. Approve/pause ads in Ad operations — not this Support inbox.",
    admin_delivery_ads_schedule_no_silent_extend:
      "To lengthen end date, use Period extension (PAID/compensation) below — not Save schedule. No hide CTA — pause and end only.",
  },
} as const;
