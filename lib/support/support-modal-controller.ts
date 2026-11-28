/**
 * Support Modal Controller — 옛 이름 유지용 다시 내보내기.
 * 단일 정의는 `support-modal-machine.ts`(상태 기계 · 계약 §5). 새 코드는 그 파일을 직접 쓴다.
 * Close ≠ resolve case / revoke session (Admin owns end consultation).
 * 새 문의하기(resetSupportModalToStart) = 분야 고르기(needsCategorySelection)부터 — 정의는 machine.
 */
export {
  closeSupportModal,
  getSupportModalState,
  isSupportModalOpen,
  openSupportModal,
  resetSupportModalToStart,
  setSupportModalCaseId,
  subscribeSupportModalState,
  type OpenSupportModalInput,
  type SupportModalPhase,
  type SupportModalState,
} from "@/lib/support/support-modal-machine";
