import { openProfileCompletionRequiredModal } from "@/lib/profile/profile-completion-modal-client";

/**
 * 서버 쓰기 게이트 403 `signup_incomplete` + `step`(전화·주소) — 「가입을 마치면 이용할 수 있어요」 안내로 연결
 * (`MissingProfileInfoModal` → 가입 단계 화면). 화면 행동 게이트를 거치지 않는 API 호출부의 공통 복구 (재감사 M2).
 * 동의 미완(`step` 없음)은 처리하지 않는다 — 기존 동의 화면 복구 경로 그대로.
 * @returns 안내를 열었으면 true
 */
export function openRegistrationRequiredFromApiPayload(
  payload: unknown,
  opts?: { next?: string },
): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as { code?: unknown; error?: unknown; step?: unknown };
  const code = typeof p.code === "string" ? p.code : typeof p.error === "string" ? p.error : "";
  if (code !== "signup_incomplete") return false;
  if (p.step !== "phone" && p.step !== "address") return false;
  const next =
    opts?.next ?? (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined);
  openProfileCompletionRequiredModal({
    actionType: "community_write",
    missingFields: p.step === "phone" ? ["phone_verified"] : ["default_address"],
    next,
  });
  return true;
}
