/**
 * 관리자 셸 공통 기반 (설계 v4 §2 가로 가드 · §6 헤더 시계) — admin.ts 와 별도(타입 직렬화 한계 회피).
 */
export const adminShellFrameMessages = {
  ko: {
    admin_landscape_guard_title: "관리자 화면은 태블릿 가로 또는 PC에서 사용합니다",
    admin_landscape_guard_desc:
      "기기를 가로로 돌리거나 브라우저 창을 넓혀 주세요 (가로 1024px 이상). 작성 중인 내용은 그대로 유지됩니다.",
    admin_landscape_guard_logout: "로그아웃",
    admin_shell_clock_label: "필리핀 현지 시간 (PHT)",
    admin_shell_account_menu: "관리자 계정",
    admin_shell_account_staff: "관리자 계정 관리",
    admin_shell_search_label: "회원·주문 빠른 조회",
    admin_shell_search_placeholder: "회원 닉네임·ID 또는 주문번호",
    admin_shell_search_submit: "조회",
    admin_shell_search_loading: "불러오는 중…",
    admin_shell_search_members: "회원",
    admin_shell_search_orders: "주문",
    admin_shell_search_all_members: "회원 목록에서 보기 ({n}명)",
    admin_shell_search_all_orders: "주문 목록에서 보기 ({n}건)",
    admin_shell_search_none: "결과 없음",
    admin_shell_search_failed: "불러오기 실패",
  },
  en: {
    admin_landscape_guard_title: "Use the admin console on a tablet in landscape or on a PC",
    admin_landscape_guard_desc:
      "Rotate your device to landscape or widen the browser window (at least 1024px wide). Anything you were editing is kept.",
    admin_landscape_guard_logout: "Sign out",
    admin_shell_clock_label: "Philippine time (PHT)",
    admin_shell_account_menu: "Admin account",
    admin_shell_account_staff: "Manage admin accounts",
    admin_shell_search_label: "Quick lookup: members · orders",
    admin_shell_search_placeholder: "Member nickname/ID or order no.",
    admin_shell_search_submit: "Look up",
    admin_shell_search_loading: "Loading…",
    admin_shell_search_members: "Members",
    admin_shell_search_orders: "Orders",
    admin_shell_search_all_members: "Open in member list ({n})",
    admin_shell_search_all_orders: "Open in order list ({n})",
    admin_shell_search_none: "No results",
    admin_shell_search_failed: "Failed to load",
  },
} as const;
