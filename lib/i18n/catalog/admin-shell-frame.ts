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
  },
  en: {
    admin_landscape_guard_title: "Use the admin console on a tablet in landscape or on a PC",
    admin_landscape_guard_desc:
      "Rotate your device to landscape or widen the browser window (at least 1024px wide). Anything you were editing is kept.",
    admin_landscape_guard_logout: "Sign out",
    admin_shell_clock_label: "Philippine time (PHT)",
  },
} as const;
