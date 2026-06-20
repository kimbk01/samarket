"use client";

import { isTerminalStatusForCleanup } from "@/lib/community-messenger/call-terminal-cleanup";

export type CommunityCallPageHostOwnershipInput = {
  hostOwnsSession: boolean;
  isTerminalSuppressed: boolean;
  runtimeSessionId: string | null;
  runtimeSessionStatus: string | null;
  routeSessionId: string;
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
    return { allowHostLoading: false, shouldClearStaleOwnership: true };
  }
  if (isTerminalStatusForCleanup(input.runtimeSessionStatus)) {
    return { allowHostLoading: false, shouldClearStaleOwnership: true };
  }
  return { allowHostLoading: true, shouldClearStaleOwnership: false };
}
