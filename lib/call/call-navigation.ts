"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  callCreateSession,
  callPatchAccept,
  callPatchCancel,
  callPatchEnd,
  callPatchMissed,
  callPatchReject,
  callSendRemoteEnd,
} from "@/lib/call/call-api";
import { dispatchCallStoreEvent } from "@/lib/call/call-store";
import { buildCallSessionHref } from "@/lib/call/call-pending-route";
import {
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallTone,
  unlockCommunityMessengerCallPlaybackFromUserGesture,
} from "@/lib/community-messenger/call-feedback-sound";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { logCall } from "@/lib/call/call-log";

let rememberedReturnPath: string | null = null;

export function rememberCallReturnPath(path?: string): void {
  if (typeof window === "undefined") return;
  rememberedReturnPath = path?.trim() || `${window.location.pathname}${window.location.search}`;
}

export function readCallReturnPath(): string | null {
  return rememberedReturnPath;
}

/** 발신·재다이얼 단일 진입 — 항상 fresh POST session */
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
  rememberCallReturnPath();

  logCall("runtime", "CALL_DIAL_START", { roomId, callKind: input.callKind });

  dispatchCallStoreEvent({
    type: "CALL_DIAL_START",
    payload: {
      roomId,
      callKind: input.callKind,
      peerUserId: input.peerUserId,
      peerLabel: input.peerLabel,
      peerAvatarUrl: input.peerAvatarUrl,
    },
  });

  const created = await callCreateSession({ roomId, callKind: input.callKind });
  if (!created.ok || !created.session?.id) {
    dispatchCallStoreEvent({ type: "CALL_DIAL_FAILED" });
    const msg = created.userMessage ?? "통화를 시작할 수 없습니다.";
    logCall("runtime", "dial_failed", { roomId, callKind: input.callKind, message: msg });
    showMessengerSnackbar(msg);
    return { ok: false, userMessage: msg };
  }

  logCall("runtime", "CALL_CREATED", { sessionId: created.session.id, roomId });
  dispatchCallStoreEvent({ type: "CALL_CREATED", payload: { session: created.session } });
  input.router.push(buildCallSessionHref(created.session.id));
  return { ok: true, sessionId: created.session.id };
}

/** @alias startFreshOutgoingCall */
export const startCall = startFreshOutgoingCall;

export function navigateToCallSession(router: AppRouterInstance, sessionId: string, action?: "accept"): void {
  router.push(buildCallSessionHref(sessionId, action));
}

export function navigateBackFromCall(router: AppRouterInstance, roomId?: string | null): void {
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

export async function runCallPatchEffect(
  type: "PATCH_ACCEPT" | "PATCH_REJECT" | "PATCH_END" | "PATCH_CANCEL" | "PATCH_MISSED",
  sessionId: string,
  peerUserId?: string | null
): Promise<boolean> {
  let res: { ok: boolean };
  switch (type) {
    case "PATCH_ACCEPT":
      res = await callPatchAccept(sessionId);
      if (res.ok) dispatchCallStoreEvent({ type: "CALL_ACCEPTED" });
      return res.ok;
    case "PATCH_REJECT":
      res = await callPatchReject(sessionId);
      return res.ok;
    case "PATCH_END":
      res = await callPatchEnd(sessionId);
      if (res.ok && peerUserId?.trim()) {
        await callSendRemoteEnd({ sessionId, toUserId: peerUserId.trim(), reason: "end" });
      }
      return res.ok;
    case "PATCH_CANCEL":
      res = await callPatchCancel(sessionId);
      if (res.ok && peerUserId?.trim()) {
        await callSendRemoteEnd({ sessionId, toUserId: peerUserId.trim(), reason: "cancel" });
      }
      return res.ok;
    case "PATCH_MISSED":
      res = await callPatchMissed(sessionId);
      return res.ok;
    default:
      return false;
  }
}

export function startCallRing(mode: "incoming" | "outgoing", kind: CommunityMessengerCallKind): void {
  stopCommunityMessengerCallTone();
  void startCommunityMessengerCallTone(mode, { callKind: kind });
}

export function stopCallRing(): void {
  stopCommunityMessengerCallTone();
}
