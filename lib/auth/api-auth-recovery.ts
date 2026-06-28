"use client";

/**
 * API 401 — refreshSession → getUser → 재시도 1회.
 * terminal 확인 시에만 호출측에서 forceClearCorruptSession.
 */

import { handleApi401 } from "@/lib/auth/dibay-session-manager";
import {
  isGuestAuthEstablished,
  isRecoverableGuestAuthEstablished,
  logGuestFetchSkipped,
} from "@/lib/auth/guest-auth-state";

export type ApiAuthRecoveryResult =
  | { recovered: true }
  | { recovered: false; terminal: boolean; phase: string };

/**
 * 401 응답 후 세션 복구 시도. fetch 재호출은 호출측에서 `recovered === true` 일 때 1회.
 */
export async function recoverFrom401Once(source: string): Promise<ApiAuthRecoveryResult> {
  if (isGuestAuthEstablished() && !isRecoverableGuestAuthEstablished()) {
    logGuestFetchSkipped("recoverFrom401Once", source);
    return { recovered: false, terminal: false, phase: "guest" };
  }
  const result = await handleApi401(source);
  if (result.ok) return { recovered: true };
  return { recovered: false, terminal: result.terminal, phase: result.phase };
}
