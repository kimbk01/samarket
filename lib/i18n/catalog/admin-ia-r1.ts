/**
 * Admin IA 재설계 R1 (감사 2026-10-30 · Owner 권장안 승인) — 메뉴 섹션·배너 현황 문구.
 * 경로·메뉴 key·원장은 바꾸지 않는다. messages.ts 의 ko/en 맨 끝에서 spread 된다.
 */
import { DIBAY_SERVICE_BRAND as B } from "../../brand/dibay-service-brand";
export const adminIaR1Messages = {
  ko: {
    // 운영 실측 (2026-10-30): 운영자 화면에 DB 테이블 이름이 보이던 문구 — 운영자 용어로 덮어쓴다 (admin.ts 원문 유지, TS7056 회피)
    admin_sanction_ledger_intro:
      "신고 처리 기록 · 거래·커뮤니티 이용 제한 · 계정 정지·차단 이력을 한 목록으로 봅니다. 각 행의 출처에서 원래 처리 화면으로 이동할 수 있습니다.",
    admin_report_card_log: "처리 이력",
    // D-5 (2026-11-04): 처리된 신고는 다시 처리할 수 없다(DB `already_processed`) — 버튼 대신 결과·글 관리 링크
    admin_report_processed_title: "처리 완료된 신고예요",
    admin_report_processed_line: "{status} · {admin} · {at}",
    admin_report_processed_hint: "이 신고로는 다시 처리할 수 없어요. 글 숨김·삭제는 글 관리 화면에서 하세요.",
    admin_report_processed_post_manage: "이 글 관리(숨김·삭제)",
    admin_report_sanctions_intro:
      "반려·경고·채팅 제한·게시글 숨김·계정 정지 등 처리 결과는 처리 이력에 기록되고, 제재가 걸리면 제재 기록에도 남습니다.",
    admin_report_list_description:
      `신고 원장 6종을 한 목록으로 봅니다. 거래(reports)·커뮤니티(community_reports) 신고는 「상세」에서 처리하고, 매장·모임·${B.LETARING}·구 거래 채팅 신고는 조회만 하며 각 행의 「처리 화면」에서 처리합니다. 계정 정지·차단은 회원 상세에서 합니다.`,
    admin_report_filter_domain_all: "도메인: 전체",
    admin_banners_overview_title: "배너 현황",
    admin_banners_overview_desc:
      "앱에 노출되는 배너 4종을 한 곳에서 봅니다. 수정·중지는 각 배너의 관리 화면에서 합니다 (원장은 그대로).",
    admin_banners_overview_col_kind: "종류",
    admin_banners_overview_col_domain: "적용 도메인",
    admin_banners_overview_col_surface: "고객 노출 위치",
    admin_banners_overview_col_status: "상태",
    admin_banners_overview_col_period: "기간",
    admin_banners_overview_col_creative: "소재 · 연결",
    admin_banners_overview_col_policy: "중지 · 보관 · 삭제",
    admin_banners_overview_col_actions: "관리",
    admin_banners_overview_kind_mypage: `${B.MY} 배너`,
    admin_banners_overview_kind_promotion: "프로모션 배너",
    admin_banners_overview_kind_feed: "피드 배너",
    admin_banners_overview_kind_delivery: `${B.DIPICK} 홈 배너`,
    admin_banners_overview_policy_mypage: "숨김 · 보관, 노출 전 초안만 삭제",
    admin_banners_overview_policy_promotion: "배너만 중지, 보관은 이벤트 보관",
    admin_banners_overview_policy_feed: "중지 · 재개 · 종료 (삭제 없음)",
    admin_banners_overview_policy_delivery: "중지 · 전환, 초안만 삭제",
    admin_banners_overview_open_customer: "고객 화면",
    admin_banners_overview_filter_kind: "종류",
    admin_banners_overview_filter_all: "전체",
    admin_banners_overview_source_failed: "일부 배너를 불러오지 못했습니다",
    admin_banners_overview_domain_common: "공통",
    admin_banners_overview_domain_trade: B.MARKET,
    admin_banners_overview_domain_community: B.LOUNGE,
    admin_banners_overview_domain_delivery: B.DIPICK,
    admin_feed_policy_unlinked_notice:
      "이 정책은 현재 고객 앱 화면에 연결된 것이 확인되지 않았습니다. 저장해도 앱 노출이 바뀌지 않을 수 있습니다.",
  },
  en: {
    admin_sanction_ledger_intro:
      "Report actions, trade/community restrictions and account suspensions/bans in one list. Each row links to its original processing screen.",
    admin_report_card_log: "Action history",
    admin_report_processed_title: "This report has been processed",
    admin_report_processed_line: "{status} · {admin} · {at}",
    admin_report_processed_hint: "It can't be processed again. Hide or delete the post from the post management screen.",
    admin_report_processed_post_manage: "Manage this post (hide/delete)",
    admin_report_sanctions_intro:
      "Rejections, warnings, chat restrictions, hidden posts and suspensions are recorded in the action history; sanctions also appear in the sanction log.",
    admin_report_list_description:
      `All six report ledgers in one list. Trade (reports) and community (community_reports) reports are processed from Detail; store, meeting, ${B.LETARING} and legacy trade-chat reports are view-only here and processed via each row’s domain screen. Account suspensions are done in member detail.`,
    admin_report_filter_domain_all: "Domain: all",
    admin_banners_overview_title: "Banner overview",
    admin_banners_overview_desc:
      "All four app banner types in one place. Edit or stop each banner in its own management screen (source data unchanged).",
    admin_banners_overview_col_kind: "Type",
    admin_banners_overview_col_domain: "Domain",
    admin_banners_overview_col_surface: "Customer placement",
    admin_banners_overview_col_status: "Status",
    admin_banners_overview_col_period: "Period",
    admin_banners_overview_col_creative: "Creative · link",
    admin_banners_overview_col_policy: "Stop · archive · delete",
    admin_banners_overview_col_actions: "Manage",
    admin_banners_overview_kind_mypage: `${B.MY} banner`,
    admin_banners_overview_kind_promotion: "Promotion banner",
    admin_banners_overview_kind_feed: "Feed banner",
    admin_banners_overview_kind_delivery: `${B.DIPICK} home banner`,
    admin_banners_overview_policy_mypage: "Hide · archive, delete unshown drafts only",
    admin_banners_overview_policy_promotion: "Stop banner only, archive via event",
    admin_banners_overview_policy_feed: "Pause · resume · end (no delete)",
    admin_banners_overview_policy_delivery: "Pause · switch, delete drafts only",
    admin_banners_overview_open_customer: "Customer view",
    admin_banners_overview_filter_kind: "Type",
    admin_banners_overview_filter_all: "All",
    admin_banners_overview_source_failed: "Some banners could not be loaded",
    admin_banners_overview_domain_common: "Common",
    admin_banners_overview_domain_trade: B.MARKET,
    admin_banners_overview_domain_community: B.LOUNGE,
    admin_banners_overview_domain_delivery: B.DIPICK,
    admin_feed_policy_unlinked_notice:
      "This policy is not confirmed to be connected to the customer app. Saving may not change what the app shows.",
  },
} as const;
