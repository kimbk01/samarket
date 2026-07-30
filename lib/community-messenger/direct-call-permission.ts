/**
 * CM 1:1 direct call permission SSOT — Kakao-style open call + block-first deny.
 * Friendship accepted는 통화 gate가 아니라 relationLabel(배지·경고) 용도만.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getFriendshipPairState,
  isFriendSavedByOwner,
  type FriendshipPairResolution,
} from "@/lib/community-messenger/friendship-resolver";
import {
  resolvePeerRelationLabel,
  type PeerRelationLabel,
} from "@/lib/community-messenger/peer-relation-label";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchBlockedPairFromSb } from "@/lib/social/user-block-ssot";

export type DirectCallPolicy = "everybody" | "friends_only" | "nobody";

/** 확장 예약 — DB/UI 후속 */
export type DirectCallListPolicy = {
  allowListUserIds?: string[];
  denyListUserIds?: string[];
};

export type DirectCallDenyCode =
  | "deny_blocked"
  | "deny_privacy"
  | "deny_room_state_mismatch"
  | "deny_deleted_account"
  | "deny_group_room"
  | "deny_permission";

export type DirectCallAllowReason = "allow_open_direct" | "allow_everybody_policy" | "allow_friend";

export type DirectCallPermissionResult =
  | { allowed: true; reason: DirectCallAllowReason; relationLabel: PeerRelationLabel }
  | { allowed: false; code: DirectCallDenyCode; relationLabel: PeerRelationLabel };

export type DirectCallKindInput = "audio" | "video";

export type DirectCallGateSnapshot = {
  canStartVoice: boolean;
  canStartVideo: boolean;
  denyCode?: DirectCallDenyCode;
  relationLabel: PeerRelationLabel;
};

export const DIRECT_CALL_API_ERROR_BY_DENY_CODE: Record<DirectCallDenyCode, string> = {
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

/** Kakao default — null/unknown → everybody (차단만 최우선 deny) */
export function resolveDirectCallPolicy(raw: unknown): DirectCallPolicy {
  const policy = trimText(raw).toLowerCase();
  if (policy === "everybody" || policy === "everyone") return "everybody";
  if (policy === "friends_only") return "friends_only";
  if (policy === "nobody" || policy === "none") return "nobody";
  return "everybody";
}

export function mapDirectCallKindToVoiceVideo(kind: DirectCallKindInput): "voice" | "video" {
  return kind === "video" ? "video" : "voice";
}

export function logCallPermission(
  tag:
    | "evaluate_start"
    | "allow"
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
    code === "deny_blocked"
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

function evaluateExplicitPrivacyDeny(input: {
  policy: DirectCallPolicy;
  friendship: FriendshipPairResolution;
  /** Callee saved caller as contact — Telegram contacts-only direction. */
  calleeSavedCaller: boolean;
  listPolicy?: DirectCallListPolicy;
  callerUserId: string;
}): DirectCallPermissionResult | null {
  const caller = trimText(input.callerUserId);
  const deny = input.listPolicy?.denyListUserIds ?? [];
  const allow = input.listPolicy?.allowListUserIds ?? [];
  if (caller && deny.includes(caller)) {
    return { allowed: false, code: "deny_privacy", relationLabel: "stranger" };
  }
  if (input.policy === "nobody") {
    if (caller && allow.includes(caller)) {
      return { allowed: true, reason: "allow_everybody_policy", relationLabel: "stranger" };
    }
    return { allowed: false, code: "deny_privacy", relationLabel: "stranger" };
  }
  if (input.policy === "everybody") {
    return null;
  }
  /**
   * friends_only / contacts — 수신자(callee)가 발신자를 자기 연락처에 저장했을 때만 허용.
   * 발신자가 수신자를 저장한 사실만으로는 통과하지 않는다.
   */
  if (input.policy === "friends_only") {
    if (input.calleeSavedCaller) {
      return null;
    }
    if (caller && allow.includes(caller)) {
      return null;
    }
    void input.friendship;
    return { allowed: false, code: "deny_privacy", relationLabel: "stranger" };
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

function evaluateRoomGate(
  room: RoomParticipantContext | null,
  relationLabel: PeerRelationLabel
): DirectCallPermissionResult | null {
  if (!room) {
    return { allowed: false, code: "deny_room_state_mismatch", relationLabel };
  }
  if (room.roomType !== "direct") {
    return { allowed: false, code: "deny_group_room", relationLabel };
  }
  if (room.roomStatus !== "active" || room.isReadonly) {
    return { allowed: false, code: "deny_room_state_mismatch", relationLabel };
  }
  if (!room.callerIsParticipant || !room.calleeIsParticipant) {
    return { allowed: false, code: "deny_room_state_mismatch", relationLabel };
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
  friendshipPreload?: FriendshipPairResolution;
  gateTag?: "api_gate_start" | "ui_gate_start" | "evaluate_start";
};

export function directCallGateFromPermissionResult(result: DirectCallPermissionResult): DirectCallGateSnapshot {
  if (result.allowed) {
    return {
      canStartVoice: true,
      canStartVideo: true,
      relationLabel: result.relationLabel,
    };
  }
  return {
    canStartVoice: false,
    canStartVideo: false,
    denyCode: result.code,
    relationLabel: result.relationLabel,
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
    logDeny("deny_permission", { callerUserId, calleeUserId, roomId });
    return { allowed: false, code: "deny_permission", relationLabel: "stranger" };
  }

  const sb = args.supabase ?? getSupabaseOrNull();
  if (!sb) {
    logDeny("deny_room_state_mismatch", { callerUserId, calleeUserId, roomId });
    return { allowed: false, code: "deny_room_state_mismatch", relationLabel: "stranger" };
  }

  const friendshipPromise = args.friendshipPreload
    ? Promise.resolve(args.friendshipPreload)
    : getFriendshipPairState(sb, callerUserId, calleeUserId);

  const [blocked, callerRestricted, calleeRestricted, friendship, calleePolicy, roomCtx, savedByMe, savedByPeer] =
    await Promise.all([
      fetchBlockedPairFromSb(sb, callerUserId, calleeUserId),
      fetchProfileRestricted(sb, callerUserId),
      fetchProfileRestricted(sb, calleeUserId),
      friendshipPromise,
      fetchCalleeCallPolicy(sb, calleeUserId),
      args.skipRoomCheck || !roomId
        ? Promise.resolve(null)
        : loadRoomParticipantContext(sb, roomId, callerUserId, calleeUserId),
      isFriendSavedByOwner(sb, callerUserId, calleeUserId),
      isFriendSavedByOwner(sb, calleeUserId, callerUserId),
    ]);

  const relationLabel = resolvePeerRelationLabel({
    blockedEitherWay: blocked.blockedEitherWay,
    blockedByMe: blocked.blockedByMe,
    savedByMe,
    savedByPeer,
    friendship,
  });

  if (blocked.blockedEitherWay) {
    logDeny("deny_blocked", { callerUserId, calleeUserId, roomId, relationLabel });
    return { allowed: false, code: "deny_blocked", relationLabel: "blocked" };
  }
  if (callerRestricted || calleeRestricted) {
    logDeny("deny_deleted_account", { callerUserId, calleeUserId, roomId, relationLabel });
    return { allowed: false, code: "deny_deleted_account", relationLabel };
  }

  if (!args.skipRoomCheck && roomId) {
    const roomGate = evaluateRoomGate(roomCtx, relationLabel);
    if (roomGate && !roomGate.allowed) {
      logDeny(roomGate.code, { callerUserId, calleeUserId, roomId, relationLabel });
      return roomGate;
    }
  }

  const privacyDeny = evaluateExplicitPrivacyDeny({
    policy: calleePolicy,
    friendship,
    calleeSavedCaller: savedByPeer,
    listPolicy: args.listPolicy,
    callerUserId,
  });
  if (privacyDeny?.allowed === false) {
    logDeny(privacyDeny.code, { callerUserId, calleeUserId, roomId, policy: calleePolicy, relationLabel });
    return { ...privacyDeny, relationLabel };
  }

  const allowReason: DirectCallAllowReason =
    privacyDeny?.allowed === true
      ? privacyDeny.reason
      : relationLabel === "mutual_friend"
        ? "allow_friend"
        : "allow_open_direct";

  logCallPermission("allow", { callerUserId, calleeUserId, roomId, reason: allowReason, relationLabel });
  return { allowed: true, reason: allowReason, relationLabel };
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
