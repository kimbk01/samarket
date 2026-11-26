"use client";

import { isAccountDependentPath } from "@/lib/auth/auth-route-classification";
import { fetchAuthSessionNoStore } from "@/lib/auth/fetch-auth-session-client";

/**
 * 재감사 2026-11-26 §9 B2 (`docs/audit/app-entry-reaudit-responsibility-ssot-2026-11-26.md` · Owner 「A1·B2 포함 진행」).
 *
 * 실측(Samsung · 직전 채팅방 복원): 이동 뒤 로그인 경계(`AuthSessionBoundary`)가 마운트되고 나서야 세션 확인을 시작해
 * 채팅방 그림이 이동 후 +0.57~0.96초를 기다렸다. 시작 목적지가 로그인 필요 화면이면 목적지를 정한 순간 같은 공용 조회
 * (`fetchAuthSessionNoStore` · 단일 비행 · 3초 「로그인 확인됨」 캐시 — Auth HARD LOCK D5)를 먼저 시작한다.
 * 경계는 지금처럼 캐시(`peekAuthSessionClientOk`)를 보고 같은 결과를 쓴다 — 판정·401·비회원 처리는 바꾸지 않는다.
 * 목적지 없음·공개 화면 → 무동작. 문서당 1회.
 */
let warmed = false;

export function warmSessionForLaunchDestination(path: string | null | undefined, source: string): boolean {
  if (warmed || typeof window === "undefined" || !path) return false;
  const p = path.split(/[?#]/)[0] || "/";
  if (!isAccountDependentPath(p)) return false;
  warmed = true;
  void fetchAuthSessionNoStore(`launch_destination_warm:${source}`).catch(() => {
    /* 경계가 지금처럼 직접 확인한다 */
  });
  return true;
}

/** Tests only. */
export function __resetLaunchDestinationSessionWarmForTests(): void {
  warmed = false;
}
