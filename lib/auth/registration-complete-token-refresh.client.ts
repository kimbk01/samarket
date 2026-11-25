"use client";

import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { nextRegistrationStep } from "@/lib/auth/dibay-registration-steps";
import {
  peekRegistrationPendingKnowledge,
  subscribeRegistrationPending,
} from "@/lib/auth/registration-pending-state.client";
import { verifiedPhoneVerdict } from "@/lib/auth/store-member-policy";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runBrowserAuthRefreshDeduped } from "@/lib/supabase/auth-refresh-telemetry";

let installed = false;
/**
 * 갱신을 끝낸(또는 갱신이 필요 없다고 확인한) 토큰 — 같은 토큰은 다시 보지 않는다.
 * 갱신 실패는 기록하지 않고 다음 알림 때 다시 시도한다(토큰당 최대 2회) · 전체 감사 A9.
 */
let lastSettledToken: string | null = null;
let failedToken: string | null = null;
let failedCount = 0;
const MAX_REFRESH_ATTEMPTS_PER_TOKEN = 2;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * 토큰 클레임 `dibay_m` 의 가입 재료로 본 「빠진 단계가 있다」 — proxy 가입 관문과 같은 판정.
 * 클레임에 가입 재료(`reg`)가 없으면 proxy 가 가입 단계를 보지 않으므로(DB 조회 없음) false.
 */
export function tokenClaimShowsRegistrationIncomplete(accessToken: string): boolean {
  const payload = decodeJwtPayload(accessToken);
  const m = payload?.dibay_m as Record<string, unknown> | undefined;
  if (!m || m.reg !== 1 || typeof m.has_phone !== "boolean" || typeof m.has_default_master !== "boolean") return false;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const isPrivilegedAdmin = isPrivilegedAdminRole(str(m.admin_role));
  const step = nextRegistrationStep({
    consentComplete: true,
    isPrivilegedAdmin,
    phoneVerified: verifiedPhoneVerdict({
      privilegedAdmin: isPrivilegedAdmin,
      role: str(m.role),
      phone_verified: m.phone_verified === true,
      phone_verified_at: str(m.phone_verified_at),
      phone_verification_method: str(m.phone_verification_method),
      provider: str(m.provider),
      auth_provider: str(m.auth_provider),
      email: str(m.email),
      has_phone: m.has_phone,
    }),
    addressComplete: m.has_default_master,
  });
  return step !== null;
}

/**
 * 서버 판정은 「가입 완료」인데 지금 토큰 클레임은 「미완료」 → 토큰 1회 갱신
 * (Auth HARD LOCK Amendment 2026-11-24 · 재감사3 #2). 토큰 클레임이 「완료」로 바뀌어 proxy 가 회원 전용 화면마다
 * DB 를 읽지 않는다. 기억(이전 단계)에 기대지 않아 단계 화면에서 앱이 처음 시작되거나 앱 복귀(`SIGNED_IN`)가 있어도 동작한다.
 * 루트(`AppBootProvider`) 모듈 로드 때 1회 설치. 갱신 주인은 기존 단일 비행(`runBrowserAuthRefreshDeduped`).
 */
export async function refreshTokenIfClaimStale(): Promise<boolean> {
  if (peekRegistrationPendingKnowledge() !== "complete") return false;
  const sb = getSupabaseClient();
  if (!sb) return false;
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token ?? null;
  if (!token || token === lastSettledToken) return false;
  if (!tokenClaimShowsRegistrationIncomplete(token)) {
    lastSettledToken = token;
    return false;
  }
  if (token === failedToken && failedCount >= MAX_REFRESH_ATTEMPTS_PER_TOKEN) return false;
  const result = await runBrowserAuthRefreshDeduped(sb, "registration_complete_claim").catch(() => null);
  if (result && !result.error && result.data?.session) {
    lastSettledToken = token;
    failedToken = null;
    failedCount = 0;
    return true;
  }
  failedCount = token === failedToken ? failedCount + 1 : 1;
  failedToken = token;
  return false;
}

export function installRegistrationCompleteTokenRefresh(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  subscribeRegistrationPending(() => {
    void refreshTokenIfClaimStale().catch(() => undefined);
  });
}

export function resetRegistrationCompleteTokenRefreshForTests(): void {
  installed = false;
  lastSettledToken = null;
  failedToken = null;
  failedCount = 0;
}
