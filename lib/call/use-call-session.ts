"use client";

import { useMemo } from "react";
import {
  deriveCallSessionPhase,
  type CallSessionPhaseContext,
  type CallSessionPhaseInput,
} from "@/lib/call/call-session-state";

/**
 * 레거시 패널·transport 상태를 단일 phase 로 합성 — `useCommunityMessengerCall` 과 동일 규칙.
 */
export function useCallSessionPhase(input: CallSessionPhaseInput): {
  phase: ReturnType<typeof deriveCallSessionPhase>["phase"];
  context: CallSessionPhaseContext;
} {
  return useMemo(
    () => deriveCallSessionPhase(input),
    [input.autoRetryAttempt, input.busy, input.panel?.mode, input.transportState]
  );
}
