"use client";

/**
 * LEGACY — 현재 어떤 페이지·훅도 import 하지 않음 (`deriveCallSessionPhase` 래퍼).
 */

import { useMemo } from "react";
import {
  deriveCallSessionPhase,
  type CallSessionPhaseContext,
  type CallSessionPhaseInput,
} from "@/lib/call/call-session-state";

/**
 * 레거시 패널·transport 상태를 단일 phase 로 합성 — 옛 P2P 훅과 동일 규칙(현재 제품 경로는 Agora `CommunityMessengerCallClient`).
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
