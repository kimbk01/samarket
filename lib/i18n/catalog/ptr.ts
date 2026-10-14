/**
 * 당겨서 새로고침(PTR) 공통 문구 SSOT — 거래·커뮤니티·배달·메신저·사장님 대시보드 공용.
 * 상태: PULLING → READY → REFRESHING → SUCCESS / ERROR (CANCELLED 는 문구 없음).
 */
export const ptrMessages = {
  ko: {
    ptr_pull_hint: "아래로 당겨 새로고침",
    ptr_release: "놓으면 새로고침",
    ptr_refreshing: "새로고침 중…",
    ptr_result_success: "새로운 내용을 불러왔어요",
    ptr_result_error: "새로고침하지 못했어요. 다시 시도해 주세요.",
    ptr_result_partial: "일부 내용을 새로고침하지 못했어요. 다시 시도해 주세요.",
  },
  en: {
    ptr_pull_hint: "Pull down to refresh",
    ptr_release: "Release to refresh",
    ptr_refreshing: "Refreshing…",
    ptr_result_success: "Updated with the latest content",
    ptr_result_error: "Couldn't refresh. Please try again.",
    ptr_result_partial: "Some content couldn't be refreshed. Please try again.",
  },
} as const;
