/**
 * 내정보 토스트 — 저장·삭제 결과 알림 (전역 토스트가 없어 내정보 범위로 한정).
 * 화면은 `showMypageToast` 만 호출하고, `MypageToastHost`(app/(main)/mypage/layout) 가 한 곳에서 그린다.
 *
 * 액션(최대 1개, 예: [되돌리기]) — 최종 설계 §1.2·§1.6·C.0.2:
 * - 일반 토스트 3초, 액션 토스트 5초.
 * - 확인 없이 해제한 항목(찜·좋아요·저장)만 [되돌리기] 를 붙인다. 파괴적 동작은 확인 모달.
 */
export const MYPAGE_TOAST_EVENT = "samarket:mypage-toast";

/** 일반 토스트 표시 시간 */
export const MYPAGE_TOAST_MS = 3000;
/** 액션([되돌리기]) 토스트 표시 시간 */
export const MYPAGE_TOAST_ACTION_MS = 5000;
/** 등장·퇴장 전환 (Motion Contract toast) */
export const MYPAGE_TOAST_MOTION_MS = 220;

export type MypageToastTone = "success" | "error";

export type MypageToastAction = {
  /** 버튼 글자 — 생략 시 "되돌리기"(i18n `mypage_comp_ds_undo`) */
  label?: string;
  onPress: () => void;
};

export type MypageToastOptions = {
  action?: MypageToastAction;
};

export type MypageToastDetail = {
  message: string;
  tone: MypageToastTone;
  action?: MypageToastAction;
};

export function showMypageToast(
  message: string,
  tone: MypageToastTone = "success",
  opts?: MypageToastOptions
): void {
  if (typeof window === "undefined" || !message.trim()) return;
  const detail: MypageToastDetail = opts?.action ? { message, tone, action: opts.action } : { message, tone };
  window.dispatchEvent(new CustomEvent<MypageToastDetail>(MYPAGE_TOAST_EVENT, { detail }));
}

/** 해제 직후 [되돌리기] 토스트(5초) — `onUndo` 는 같은 리소스 재등록(또는 지연 커밋 취소) */
export function showMypageUndoToast(message: string, onUndo: () => void, label?: string): void {
  showMypageToast(message, "success", { action: { label, onPress: onUndo } });
}

export function mypageToastDurationMs(detail: Pick<MypageToastDetail, "action">): number {
  return detail.action ? MYPAGE_TOAST_ACTION_MS : MYPAGE_TOAST_MS;
}
