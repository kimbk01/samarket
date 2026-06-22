"use client";

import type { CommunityMessengerCallKind, CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";
import type { PatchCommunityCallSessionAction } from "@/lib/community-messenger/call-http-actions";

export type CallEngineState =
  | "idle"
  | "outgoing_creating"
  | "outgoing_ringing"
  | "incoming_ringing"
  | "accepting"
  | "joining"
  | "connected"
  | "reconnecting"
  | "ending"
  | "ended"
  | "rejected"
  | "missed"
  | "cancelled"
  | "failed";

export type CallEngineTerminalState = "ended" | "rejected" | "missed" | "cancelled" | "failed";

export const CALL_ENGINE_TERMINAL_STATES: readonly CallEngineTerminalState[] = [
  "ended",
  "rejected",
  "missed",
  "cancelled",
  "failed",
] as const;

export type CallEngineDirection = "outgoing" | "incoming";
export type CallEngineSource = "web_in_app" | "fcm" | "native_fsi" | "deep_link" | "room_hydrate";
export type CallEngineSurfaceOwner =
  | "native_locked_screen"
  | "native_fullscreen_intent"
  | "web_call_screen"
  | "web_in_app_banner"
  | "dock_or_pip";

export type CallIdentity = {
  callId: string;
  roomId: string;
  callerUserId: string;
  calleeUserId: string;
  direction: CallEngineDirection;
  mediaType: CommunityMessengerCallKind;
  createdAt: string;
  status: CommunityMessengerCallSessionStatus;
  source: CallEngineSource;
};

export type CallEngineActionName = Extract<PatchCommunityCallSessionAction, "accept" | "reject" | "cancel" | "end" | "missed">;
