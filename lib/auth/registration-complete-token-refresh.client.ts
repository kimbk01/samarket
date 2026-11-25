"use client";

import {
  consumeRegistrationJustCompleted,
  subscribeRegistrationPending,
} from "@/lib/auth/registration-pending-state.client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runBrowserAuthRefreshDeduped } from "@/lib/supabase/auth-refresh-telemetry";

let installed = false;

/**
 * 가입을 막 마쳤다(서버 판정 「빠진 단계 → 완료」) → 로그인 토큰 1회 갱신 (Auth HARD LOCK Amendment 2026-11-24 · 재감사2 #1).
 * 토큰 클레임 `dibay_m` 이 「완료」로 바뀌어 proxy 가 회원 전용 화면마다 DB 를 읽지 않는다.
 * 루트(`AppBootProvider`) 모듈 로드 때 1회 설치 — 가입 단계 화면(`/auth/onboarding/*`)을 포함한 모든 화면에서 동작한다.
 * 갱신 주인은 기존 단일 비행(`runBrowserAuthRefreshDeduped`) — 새 갱신 경로·주기 없음.
 */
export function installRegistrationCompleteTokenRefresh(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  subscribeRegistrationPending(() => {
    if (!consumeRegistrationJustCompleted()) return;
    const sb = getSupabaseClient();
    if (sb) void runBrowserAuthRefreshDeduped(sb, "registration_complete_claim").catch(() => undefined);
  });
}

export function resetRegistrationCompleteTokenRefreshForTests(): void {
  installed = false;
}
