/**
 * CM 1:1 direct call permission SSOT — Telegram-style friends_only default.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getFriendshipPairState,
  type FriendshipPairResolution,
} from "@/lib/community-messenger/friendship-resolver";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchBlockedPairFromSb } from "@/lib/social/user-block-ssot";

export type DirectCallPolicy = "everybody" | "friends_only" | "nobody";

/** 확장 예약 — DB/UI 후속 */
export type DirectCallListPolicy = {
  allowListUserIds?: string[];
  denyListUserIds?: string[];
};

export type DirectCallDenyCode =
  | "deny_pending_friend"
  | "deny_not_friend"
  | "deny_blocked"
  | "deny_privacy"
  | "deny_room_state_mismatch"
  | "deny_deleted_account"
  | "deny_group_room"
  | "deny_permission";

export type DirectCallAllowReason = "allow_friend" | "allow_everybody_policy";

export type DirectCallPermissionResult =
  | { allowed: true; reason: DirectCallAllowReason }
  | { allowed: false; code: DirectCallDenyCode };

export type DirectCallKindInput = "audio" | "video";

export type DirectCallGateSnapshot = {
  canStartVoice: boolean;
  canStartVideo: boolean;
  denyCode?: DirectCallDenyCode;
};

export const DIRECT_CALL_API_ERROR_BY_DENY_CODE: Record<DirectCallDenyCode, string> = {
  deny_pending_friend: "call_denied_pending_friend",
  deny_not_friend: "call_denied_not_friend",
  deny_blocked: "call_denied_blocked",
  deny_privacy: "call_denied_privacy",
  deny_room_state_mismatch: "call_denied_room_state",
  deny_deleted_account: "call_denied_account",
  deny_group_room: "call_denied_group_room",
  deny_permission: "call_denied_permission",
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseOrNull(): SupabaseClient<any> | null {
  try {
    return getSupabaseServer();
  } catch {
    return tryCreateSupabaseServiceClient();
  }
}

export function resolveDirectCallPolicy(raw: unknown): DirectCallPolicy {
  const policy = trimText(raw).toLowerCase();
  if (policy === "everybody" || policy === "everyone") return "everybody";
  if (policy === "nobody" || policy === "none") return "nobody";
  return "friends_only";
}

export function mapDirectCallKindToVoiceVideo(kind: DirectCallKindInput): "voice" | "video" {
  return kind === "video" ? "video" : "voice";
}

export function logCallPermission(
  tag:
    | "evaluate_start"
    | "allow"
    | "deny_pending_friend"
    | "deny_not_friend"
    | "deny_blocked"
    | "deny_privacy"
    | "deny_permission"
    | "deny_room_state_mismatch"
    | "deny_deleted_account"
    | "deny_group_room"
    | "api_gate_start"
    | "ui_gate_start"
    | "stale_room_refresh",
  labels?: Record<string, string | undefined>
): void {
  const payload = Object.fromEntries(
    Object.entries(labels ?? {}).filter(([, v]) => v != null && String(v).trim() !== "")
  );
  console.info(`[call-permission] ${tag}`, payload);
}

function logDeny(code: DirectCallDenyCode, labels?: Record<string, string | undefined>): void {
  const tag =
    code === "deny_pending_friend"
      ? "deny_pending_friend"
      : code === "deny_not_friend"
        ? "deny_not_friend"
        : code === "deny_blocked"
          ? "deny_blocked"
          : code === "deny_privacy"
            ? "deny_privacy"
            : code === "deny_permission"
              ? "deny_permission"
              : code === "deny_room_state_mismatch"
                ? "deny_room_state_mismatch"
                : code === "deny_deleted_account"
                  ? "deny_deleted_account"
                  : "deny_group_room";
  logCallPermission(tag, labels);
}

async function fetchCalleeCallPolicy(
  sb: SupabaseClient<any>,
  calleeUserId: string
): Promise<DirectCallPolicy> {
  const { data } = await sb
    .from("profiles")
    .select("messenger_direct_call_policy")
    .eq("id", calleeUserId)
    .maybeSingle();
  return resolveDirectCallPolicy((data as { messenger_direct_call_policy?: unknown } | null)?.messenger_direct_call_policy);
}

async function fetchProfileRestricted(
  sb: SupabaseClient<any>,
  userId: string
): Promise<boolean> {
  const { data } = await sb.from("profiles").select("status").eq("id", userId).maybeSingle();
  const status = trimText((data as { status?: string } | null)?.status).toLowerCase();
  return status === "suspended" || status === "deleted";
}

function evaluatePrivacyForCall(input: {
  policy: DirectCallPolicy;
  friendship: FriendshipPairResolution;
  listPolicy?: DirectCallListPolicy;
  callerUserId: string;
}): DirectCallPermissionResult | null {
  const caller = trimText(input.callerUserId);
  const deny = input.listPolicy?.denyListUserIds ?? [];
  const allow = input.listPolicy?.allowListUserIds ?? [];
  if (caller && deny.includes(caller)) {
    return { allowed: false, code: "deny_privacy" };
  }
  if (input.policy === "nobody") {
    if (caller && allow.includes(caller)) {
      return { allowed: true, reason: "allow_everybody_policy" };
    }
    return { allowed: false, code: "deny_privacy" };
  }
  if (input.policy === "everybody") {
    return { allowed: true, reason: "allow_everybody_policy" };
  }
  if (input.friendship.state === "accepted") {
    return { allowed: true, reason: "allow_friend" };
  }
  if (caller && allow.includes(caller)) {
    return { allowed: true, reason: "allow_everybody_policy" };
  }
  return null;
}

function evaluateFriendshipGate(friendship: FriendshipPairResolution): DirectCallPermissionResult | null {
  if (friendship.state === "pending") {
    return { allowed: false, code: "deny_pending_friend" };
  }
  if (friendship.state === "blocked" || friendship.state === "removed") {
    return { allowed: false, code: "deny_blocked" };
  }
  if (friendship.state === "readd_cooldown") {
    return { allowed: false, code: "deny_not_friend" };
  }
  if (friendship.state === "none") {
    return { allowed: false, code: "deny_not_friend" };
  }
  return null;
}

type RoomParticipantContext = {
  roomType: string;
  roomStatus: string;
  isReadonly: boolean;
  callerIsParticipant: boolean;
  calleeIsParticipant: boolean;
};

async function loadRoomParticipantContext(
  sb: SupabaseClient<any>,
  roomId: string,
  callerUserId: string,
  calleeUserId: string
): Promise<RoomParticipantContext | null> {
  const rid = trimText(roomId);
  if (!rid) return null;
  const [{ data: room }, { data: participants }] = await Promise.all([
    sb
      .from("community_messenger_rooms")
      .select("room_type, room_status, is_readonly")
      .eq("id", rid)
      .maybeSingle(),
    sb.from("community_messenger_participants").select("user_id").eq("room_id", rid),
  ]);
  if (!room) return null;
  const memberIds = new Set(
    ((participants ?? []) as Array<{ user_id?: string }>)
      .map((row) => trimText(row.user_id))
      .filter(Boolean)
  );
  return {
    roomType: trimText((room as { room_type?: string }).room_type),
    roomStatus: trimText((room as { room_status?: string }).room_status) || "active",
    isReadonly: Boolean((room as { is_readonly?: boolean }).is_readonly),
    callerIsParticipant: memberIds.has(callerUserId),
    calleeIsParticipant: memberIds.has(calleeUserId),
  };
}

function evaluateRoomGate(room: RoomParticipantContext | null): DirectCallPermissionResult | null {
  if (!room) {
    return { allowed: false, code: "deny_room_state_mismatch" };
  }
  if (room.roomType !== "direct") {
    return { allowed: false, code: "deny_group_room" };
  }
  if (room.roomStatus !== "active" || room.isReadonly) {
    return { allowed: false, code: "deny_room_state_mismatch" };
  }
  if (!room.callerIsParticipant || !room.calleeIsParticipant) {
    return { allowed: false, code: "deny_room_state_mismatch" };
  }
  return null;
}

export type CanStartDirectCallArgs = {
  callerUserId: string;
  calleeUserId: string;
  roomId?: string;
  callKind: DirectCallKindInput;
  supabase?: SupabaseClient<any> | null;
  skipRoomCheck?: boolean;
  listPolicy?: DirectCallListPolicy;
  /** snapshot·guard 등에서 friendship SSOT 를 이미 조회한 경우 재조회 생략 */
  friendshipPreload?: FriendshipPairResolution;
  gateTag?: "api_gate_start" | "ui_gate_start" | "evaluate_start";
};

export function directCallGateFromPermissionResult(result: DirectCallPermissionResult): DirectCallGateSnapshot {
  if (result.allowed) {
    return { canStartVoice: true, canStartVideo: true };
  }
  return {
    canStartVoice: false,
    canStartVideo: false,
    denyCode: result.code,
  };
}

export async function canStartDirectCallBetweenUsers(
  args: CanStartDirectCallArgs
): Promise<DirectCallPermissionResult> {
  const callerUserId = trimText(args.callerUserId);
  const calleeUserId = trimText(args.calleeUserId);
  const roomId = trimText(args.roomId);
  logCallPermission(args.gateTag ?? "evaluate_start", {
    callerUserId,
    calleeUserId,
    roomId: roomId || undefined,
    callKind: args.callKind,
  });

  if (!callerUserId || !calleeUserId || callerUserId === calleeUserId) {
    logDeny("deny_not_friend", { callerUserId, calleeUserId, roomId });
    return { allowed: false, code: "deny_not_friend" };
  }

  const sb = args.supabase ?? getSupabaseOrNull();
  if (!sb) {
    logDeny("deny_room_state_mismatch", { callerUserId, calleeUserId, roomId });
    return { allowed: false, code: "deny_room_state_mismatch" };
  }

  const friendshipPromise = args.friendshipPreload
    ? Promise.resolve(args.friendshipPreload)
    : getFriendshipPairState(sb, callerUserId, calleeUserId);

  const [blocked, callerRestricted, calleeRestricted, friendship, calleePolicy, roomCtx] =
    await Promise.all([
      fetchBlockedPairFromSb(sb, callerUserId, calleeUserId),
      fetchProfileRestricted(sb, callerUserId),
      fetchProfileRestricted(sb, calleeUserId),
      friendshipPromise,
      fetchCalleeCallPolicy(sb, calleeUserId),
      args.skipRoomCheck || !roomId
        ? Promise.resolve(null)
        : loadRoomParticipantContext(sb, roomId, callerUserId, calleeUserId),
    ]);

  if (blocked.blockedEitherWay) {
    logDeny("deny_blocked", { callerUserId, calleeUserId, roomId });
    return { allowed: false, code: "deny_blocked" };
  }
  if (callerRestricted || calleeRestricted) {
    logDeny("deny_deleted_account", { callerUserId, calleeUserId, roomId });
    return { allowed: false, code: "deny_deleted_account" };
  }

  if (!args.skipRoomCheck && roomId) {
    const roomGate = evaluateRoomGate(roomCtx);
    if (roomGate && !roomGate.allowed) {
      logDeny(roomGate.code, { callerUserId, calleeUserId, roomId });
      return roomGate;
    }
  }

  const privacyResult = evaluatePrivacyForCall({
    policy: calleePolicy,
    friendship,
    listPolicy: args.listPolicy,
    callerUserId,
  });
  if (privacyResult?.allowed === false) {
    logDeny(privacyResult.code, { callerUserId, calleeUserId, roomId, policy: calleePolicy });
    return privacyResult;
  }
  if (privacyResult?.allowed === true) {
    logCallPermission("allow", { callerUserId, calleeUserId, roomId, reason: privacyResult.reason });
    return privacyResult;
  }

  const friendshipGate = evaluateFriendshipGate(friendship);
  if (friendshipGate && !friendshipGate.allowed) {
    logDeny(friendshipGate.code, { callerUserId, calleeUserId, roomId, friendship: friendship.state });
    return friendshipGate;
  }

  logCallPermission("allow", { callerUserId, calleeUserId, roomId, reason: "allow_friend" });
  return { allowed: true, reason: "allow_friend" };
}

export async function buildDirectCallGateSnapshot(input: {
  callerUserId: string;
  calleeUserId: string;
  roomId?: string;
  supabase?: SupabaseClient<any> | null;
  friendshipPreload?: FriendshipPairResolution;
}): Promise<DirectCallGateSnapshot> {
  const sb = input.supabase ?? getSupabaseOrNull();
  const result = await canStartDirectCallBetweenUsers({
    callerUserId: input.callerUserId,
    calleeUserId: input.calleeUserId,
    roomId: input.roomId,
    callKind: "audio",
    supabase: sb,
    skipRoomCheck: !trimText(input.roomId),
    friendshipPreload: input.friendshipPreload,
  });
  return directCallGateFromPermissionResult(result);
}

export function mapDenyCodeToApiError(code: DirectCallDenyCode): string {
  return DIRECT_CALL_API_ERROR_BY_DENY_CODE[code];
}
