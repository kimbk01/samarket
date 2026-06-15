"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  callV3CreateSession,
  callV3PatchAccept,
  callV3PatchCancel,
  callV3PatchEnd,
  callV3PatchMissed,
  callV3PatchReject,
  callV3SendRemoteEnd,
} from "@/lib/call-v3/call-v3-api";
import { dispatchCallV3StoreEvent } from "@/lib/call-v3/call-v3-store";
import { buildCallV3SessionHref } from "@/lib/call-v3/call-v3-pending-route";
import {
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallTone,
  unlockCommunityMessengerCallPlaybackFromUserGesture,
} from "@/lib/community-messenger/call-feedback-sound";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { logCallV3 } from "@/lib/call-v3/call-v3-log";

let rememberedReturnPath: string | null = null;

export function rememberCallV3ReturnPath(path?: string): void {
  if (typeof window === "undefined") return;
  rememberedReturnPath = path?.trim() || `${window.location.pathname}${window.location.search}`;
}

export function readCallV3ReturnPath(): string | null {
  return rememberedReturnPath;
}

export async function startFreshOutgoingCall(input: {
  roomId: string;
  callKind: CommunityMessengerCallKind;
  peerUserId?: string | null;
  peerLabel?: string;
  peerAvatarUrl?: string | null;
  router: AppRouterInstance;
}): Promise<{ ok: boolean; sessionId?: string; userMessage?: string }> {
  const roomId = input.roomId.trim();
  if (!roomId) return { ok: false, userMessage: "통화를 시작할 수 없습니다." };

  unlockCommunityMessengerCallPlaybackFromUserGesture();
  rememberCallV3ReturnPath();

  logCallV3("CALL_DIAL_START", { roomId, callKind: input.callKind });

  dispatchCallV3StoreEvent({
    type: "CALL_DIAL_START",
    payload: {
      roomId,
      callKind: input.callKind,
      peerUserId: input.peerUserId,
      peerLabel: input.peerLabel,
      peerAvatarUrl: input.peerAvatarUrl,
    },
  });

  const created = await callV3CreateSession({ roomId, callKind: input.callKind });
  if (!created.ok || !created.session?.id) {
    dispatchCallV3StoreEvent({ type: "CALL_DIAL_FAILED" });
    const msg = created.userMessage ?? "통화를 시작할 수 없습니다.";
    logCallV3("redial_failed", { roomId, callKind: input.callKind, message: msg });
    showMessengerSnackbar(msg);
    return { ok: false, userMessage: msg };
  }

  logCallV3("CALL_CREATED", { sessionId: created.session.id, roomId });
  dispatchCallV3StoreEvent({ type: "CALL_CREATED", payload: { session: created.session } });
  const href = buildCallV3SessionHref(created.session.id);
  input.router.push(href);
  return { ok: true, sessionId: created.session.id };
}

export function navigateToCallV3Session(router: AppRouterInstance, sessionId: string, action?: "accept"): void {
  router.push(buildCallV3SessionHref(sessionId, action));
}

export function navigateBackFromCallV3(router: AppRouterInstance, roomId?: string | null): void {
  const fallback = roomId?.trim()
    ? `/community-messenger/rooms/${encodeURIComponent(roomId.trim())}`
    : "/community-messenger";
  const target = rememberedReturnPath?.trim() || fallback;
  rememberedReturnPath = null;
  if (target.startsWith("/community-messenger/calls/")) {
    router.replace(fallback);
    return;
  }
  router.replace(target);
}

export async function runCallV3PatchEffect(
  type: "PATCH_ACCEPT" | "PATCH_REJECT" | "PATCH_END" | "PATCH_CANCEL" | "PATCH_MISSED",
  sessionId: string,
  peerUserId?: string | null
): Promise<boolean> {
  let res: { ok: boolean };
  switch (type) {
    case "PATCH_ACCEPT":
      res = await callV3PatchAccept(sessionId);
      if (res.ok) dispatchCallV3StoreEvent({ type: "CALL_ACCEPTED" });
      return res.ok;
    case "PATCH_REJECT":
      res = await callV3PatchReject(sessionId);
      return res.ok;
    case "PATCH_END":
      res = await callV3PatchEnd(sessionId);
      if (res.ok && peerUserId?.trim()) {
        await callV3SendRemoteEnd({ sessionId, toUserId: peerUserId.trim(), reason: "end" });
      }
      return res.ok;
    case "PATCH_CANCEL":
      res = await callV3PatchCancel(sessionId);
      if (res.ok && peerUserId?.trim()) {
        await callV3SendRemoteEnd({ sessionId, toUserId: peerUserId.trim(), reason: "cancel" });
      }
      return res.ok;
    case "PATCH_MISSED":
      res = await callV3PatchMissed(sessionId);
      return res.ok;
    default:
      return false;
  }
}

export function startCallV3Ring(mode: "incoming" | "outgoing", kind: CommunityMessengerCallKind): void {
  stopCommunityMessengerCallTone();
  void startCommunityMessengerCallTone(mode, { callKind: kind });
}

export function stopCallV3Ring(): void {
  stopCommunityMessengerCallTone();
}
