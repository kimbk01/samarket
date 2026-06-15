"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { isCallV3Enabled } from "@/lib/call-v3/call-v3-feature-flag";
import { startFreshOutgoingCall } from "@/lib/call-v3/call-v3-navigation";
import { executeOutgoingRedialFromTerminal } from "@/lib/community-messenger/outgoing-redial-handoff";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

/** 발신·재다이얼 단일 진입 — v3 ON: fresh POST, OFF: 레거시 handoff */
export async function startOutgoingCallUnified(input: {
  kind: CommunityMessengerCallKind;
  roomId: string | null;
  peerUserId?: string | null;
  peerLabel?: string;
  peerAvatarUrl?: string | null;
  router: AppRouterInstance;
  cleanupAgora?: () => Promise<void>;
}): Promise<{ ok: boolean; userMessage?: string; sessionId?: string }> {
  const roomId = input.roomId?.trim();
  if (!roomId) return { ok: false, userMessage: "통화를 시작할 수 없습니다." };

  if (isCallV3Enabled()) {
    return startFreshOutgoingCall({
      roomId,
      callKind: input.kind,
      peerUserId: input.peerUserId,
      peerLabel: input.peerLabel,
      peerAvatarUrl: input.peerAvatarUrl,
      router: input.router,
    });
  }

  const result = await executeOutgoingRedialFromTerminal({
    kind: input.kind,
    roomId,
    peerUserId: input.peerUserId?.trim() ?? null,
    cleanupAgora: input.cleanupAgora,
    navigate: (href) => input.router.replace(href),
  });
  if (!result.ok) {
    return { ok: false, userMessage: result.userMessage };
  }
  return {
    ok: true,
    sessionId: result.session.id,
  };
}
