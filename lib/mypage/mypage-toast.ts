/**
 * 내정보 토스트 — 저장·삭제 결과 알림 (전역 토스트가 없어 내정보 범위로 한정).
 * 화면은 `showMypageToast` 만 호출하고, `MypageToastHost`(app/(main)/mypage/layout) 가 한 곳에서 그린다.
 */
export const MYPAGE_TOAST_EVENT = "samarket:mypage-toast";

export type MypageToastTone = "success" | "error";

export type MypageToastDetail = { message: string; tone: MypageToastTone };

export function showMypageToast(message: string, tone: MypageToastTone = "success"): void {
  if (typeof window === "undefined" || !message.trim()) return;
  window.dispatchEvent(new CustomEvent<MypageToastDetail>(MYPAGE_TOAST_EVENT, { detail: { message, tone } }));
}
