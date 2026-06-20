"use client";

import { isTerminalStatusForCleanup } from "@/lib/community-messenger/call-terminal-cleanup";

export type CommunityCallPageHostOwnershipInput = {
  hostOwnsSession: boolean;
  isTerminalSuppressed: boolean;
  runtimeSessionId: string | null;
  runtimeSessionStatus: string | null;
  routeSessionId: string;
  /** tmp_* 발신 bootstrap — runtime 등록 전 call route CallClient 유지 */
  isTempCallRouteSession?: boolean;
  /** POST 직후 navigation seed — tmp→real 교체·hydrate 구간 */
  hasNavigationSeed?: boolean;
  /** setActiveCallSession live phase 와 route sessionId 일치 */
  hasLiveActiveCallSession?: boolean;
};

export type CommunityCallPageHostOwnershipDecision = {
  allowHostLoading: boolean;
  shouldClearStaleOwnership: boolean;
};

export function decideCommunityCallPageHostOwnership(
  input: CommunityCallPageHostOwnershipInput
): CommunityCallPageHostOwnershipDecision {
  if (!input.hostOwnsSession) {
    return { allowHostLoading: false, shouldClearStaleOwnership: false };
  }
  if (input.isTerminalSuppressed) {
    return { allowHostLoading: false, shouldClearStaleOwnership: true };
  }
  if (!input.runtimeSessionId || input.runtimeSessionId !== input.routeSessionId.trim()) {
    const inBootstrap =
      input.isTempCallRouteSession === true ||
      input.hasNavigationSeed === true ||
      input.hasLiveActiveCallSession === true;
    if (inBootstrap) {
      return { allowHostLoading: false, shouldClearStaleOwnership: false };
    }
    return { allowHostLoading: false, shouldClearStaleOwnership: true };
  }
  if (isTerminalStatusForCleanup(input.runtimeSessionStatus)) {
    return { allowHostLoading: false, shouldClearStaleOwnership: true };
  }
  return { allowHostLoading: true, shouldClearStaleOwnership: false };
}

export type CommunityCallActiveHostOwnershipInput = {
  hostedSessionId: string;
  isTerminalSuppressed: boolean;
  /** hostedActive 만 남고 dock/pip/detached 가 없을 때 */
  isHostedActiveOnly: boolean;
  /** `/community-messenger/calls/[sessionId]` — tmp 발신·수신 bootstrap 구분 */
  onCallSessionRoute: boolean;
  /** in-place video accept — `primeCommunityMessengerCallNavigationSeed` 직후 host mount */
  hasNavigationSeed: boolean;
  /** `setActiveCallSession` live phase 와 hosted sessionId 일치 */
  hasLiveActiveCallSession: boolean;
  runtimeSessionId: string | null;
  runtimeSessionStatus: string | null;
};

export type CommunityCallActiveHostOwnershipDecision = {
  shouldMountCallClient: boolean;
  shouldClearStaleOwnership: boolean;
};

/**
 * ActiveCallHost 전용 — CallClient 마운트 전 stale 판정.
 * runtime 미등록(`!runtimeSessionId`)만으로 clear·navigateBack race 금지.
 * 메신저 홈(통화목록 등)에 남은 hostedActive 는 CallClient 없이 flags 만 정리한다.
 */
export function decideCommunityCallActiveHostOwnership(
  input: CommunityCallActiveHostOwnershipInput
): CommunityCallActiveHostOwnershipDecision {
  const sid = input.hostedSessionId.trim();
  if (!sid) {
    return { shouldMountCallClient: false, shouldClearStaleOwnership: false };
  }
  if (input.isTerminalSuppressed) {
    return { shouldMountCallClient: false, shouldClearStaleOwnership: true };
  }

  const runtimeId = input.runtimeSessionId?.trim() ?? "";
  if (runtimeId && runtimeId !== sid) {
    return { shouldMountCallClient: false, shouldClearStaleOwnership: true };
  }
  if (runtimeId === sid && isTerminalStatusForCleanup(input.runtimeSessionStatus)) {
    return { shouldMountCallClient: false, shouldClearStaleOwnership: true };
  }
  /** Dedicated call route — page CallClient 단일 소유 (host dynamic loading skeleton 겹침 방지). */
  if (input.onCallSessionRoute) {
    return { shouldMountCallClient: false, shouldClearStaleOwnership: false };
  }
  if (!runtimeId && input.isHostedActiveOnly && !input.onCallSessionRoute) {
    if (input.hasNavigationSeed || input.hasLiveActiveCallSession) {
      return { shouldMountCallClient: true, shouldClearStaleOwnership: false };
    }
    return { shouldMountCallClient: false, shouldClearStaleOwnership: true };
  }

  return { shouldMountCallClient: true, shouldClearStaleOwnership: false };
}
