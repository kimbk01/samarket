"use client";

/**
 * API 401 — refreshSession → getUser → 재시도 1회.
 * terminal 확인 시에만 호출측에서 forceClearCorruptSession.
 */

import { ensureSessionHealthy, getSessionPhase } from "@/lib/auth/dibay-session-manager";
import { handleApi401 } from "@/lib/auth/dibay-session-manager";
import { isGuestAuthEstablished, logGuestFetchSkipped } from "@/lib/auth/guest-auth-state";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";

export type ApiAuthRecoveryResult =
  | { recovered: true }
  | { recovered: false; terminal: boolean; phase: string };

let lastDocumentHiddenAtMs = 0;

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      lastDocumentHiddenAtMs = Date.now();
    }
  });
}

function outgoingCallShouldWarmAuth(): boolean {
  if (typeof document === "undefined") return false;
  if (getSessionPhase() !== "authenticated") return true;
  if (document.visibilityState !== "visible") return true;
  if (lastDocumentHiddenAtMs <= 0) return false;
  return Date.now() - lastDocumentHiddenAtMs < 45_000;
}

/**
 * 잠금 해제·백그라운드 복귀 직후 발신 bootstrap 전 — 세션 refresh 1회(필요 시만).
 */
export async function ensureAuthReadyForOutgoingCall(
  source: string
): Promise<{ ok: true } | { ok: false; userMessage: string; terminal?: boolean }> {
  if (!outgoingCallShouldWarmAuth()) return { ok: true };

  const lang = getRuntimeAppLanguage();
  const loginMsg = safeTranslate(lang, "common_login_required", {
    fallbackKo: "로그인이 필요합니다.",
    fallbackEn: "Please sign in.",
  });

  let health = await ensureSessionHealthy(`outgoing-call:${source}`);
  if (health.ok) return { ok: true };
  if (health.terminal) return { ok: false, userMessage: loginMsg, terminal: true };

  await new Promise((r) => setTimeout(r, 320));
  health = await ensureSessionHealthy(`outgoing-call-retry:${source}`);
  if (health.ok) return { ok: true };
  if (health.phase === "guest" || health.terminal) {
    return { ok: false, userMessage: loginMsg, terminal: health.terminal };
  }
  /** loading·일시 네트워크 — bootstrap fetch 가 401 recovery 로 이어갈 수 있게 통과 */
  return { ok: true };
}

/**
 * 401 응답 후 세션 복구 시도. fetch 재호출은 호출측에서 `recovered === true` 일 때 1회.
 */
export async function recoverFrom401Once(source: string): Promise<ApiAuthRecoveryResult> {
  if (isGuestAuthEstablished()) {
    logGuestFetchSkipped("recoverFrom401Once", source);
    return { recovered: false, terminal: false, phase: "guest" };
  }
  const result = await handleApi401(source);
  if (result.ok) return { recovered: true };
  return { recovered: false, terminal: result.terminal, phase: result.phase };
}

/** 잠금 해제·백그라운드 복귀 직후 API — 401 시 refresh 후 1회 재시도 */
export async function fetchWith401Recovery(
  url: string,
  init: RequestInit,
  source: string
): Promise<Response> {
  const base: RequestInit = { ...init, credentials: "include", cache: "no-store" };
  const res = await fetch(url, base);
  if (res.status !== 401) return res;
  const recovery = await recoverFrom401Once(source);
  if (!recovery.recovered) return res;
  return fetch(url, base);
}
