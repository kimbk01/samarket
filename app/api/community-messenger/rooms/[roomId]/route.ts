import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import {
  getCommunityMessengerRoomSnapshot,
  inviteCommunityMessengerGroupMembers,
  kickCommunityMessengerGroupMember,
  markCommunityMessengerRoomAsRead,
  setCommunityMessengerGroupMemberRole,
  transferCommunityMessengerGroupOwner,
  updateCommunityMessengerParticipantSettings,
  updateCommunityMessengerPrivateGroupNotice,
  updateCommunityMessengerPrivateGroupPermissions,
  updateCommunityMessengerRoomArchiveState,
  updateCommunityMessengerRoomContextMeta,
} from "@/lib/community-messenger/service";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:room-snapshot:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "대화방 정보 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_room_snapshot_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId } = await params;
  const rawLimit = req.nextUrl.searchParams.get("messages");
  const memberHydration = req.nextUrl.searchParams.get("memberHydration")?.trim().toLowerCase();
  const hydrateFullMemberList = memberHydration !== "minimal";
  const snapshot = await getCommunityMessengerRoomSnapshot(auth.userId, roomId, {
    initialMessageLimit:
      rawLimit != null && rawLimit !== ""
        ? Math.floor(Number(rawLimit))
        : undefined,
    hydrateFullMemberList,
  });
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...snapshot });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:room-patch:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "대화방 변경 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_room_patch_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body:
    | { action?: "invite"; memberIds?: string[] }
    | { action?: "participant_settings"; isMuted?: boolean; isPinned?: boolean }
    | { action?: "mark_read" }
    | { action?: "archive"; archived?: boolean }
    | { action?: "group_notice"; noticeText?: string }
    | {
        action?: "group_permissions";
        allowMemberInvite?: boolean;
        allowAdminInvite?: boolean;
        allowAdminKick?: boolean;
        allowAdminEditNotice?: boolean;
        allowMemberUpload?: boolean;
        allowMemberCall?: boolean;
      }
    | { action?: "group_member_role"; targetUserId?: string; nextRole?: "admin" | "member" }
    | { action?: "group_owner_transfer"; targetUserId?: string }
    | { action?: "group_member_remove"; targetUserId?: string }
    | { action?: "context_meta"; contextMeta?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { roomId } = await params;
  if (body.action === "invite") {
    const result = await inviteCommunityMessengerGroupMembers({
      userId: auth.userId,
      roomId,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : [],
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "participant_settings") {
    const result = await updateCommunityMessengerParticipantSettings({
      userId: auth.userId,
      roomId,
      isMuted: typeof body.isMuted === "boolean" ? body.isMuted : undefined,
      isPinned: typeof body.isPinned === "boolean" ? body.isPinned : undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "mark_read") {
    const result = await markCommunityMessengerRoomAsRead({
      userId: auth.userId,
      roomId,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "archive") {
    const result = await updateCommunityMessengerRoomArchiveState({
      userId: auth.userId,
      roomId,
      archived: typeof body.archived === "boolean" ? body.archived : true,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "group_notice") {
    const result = await updateCommunityMessengerPrivateGroupNotice({
      userId: auth.userId,
      roomId,
      noticeText: typeof body.noticeText === "string" ? body.noticeText : "",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "group_permissions") {
    const result = await updateCommunityMessengerPrivateGroupPermissions({
      userId: auth.userId,
      roomId,
      allowMemberInvite: typeof body.allowMemberInvite === "boolean" ? body.allowMemberInvite : undefined,
      allowAdminInvite: typeof body.allowAdminInvite === "boolean" ? body.allowAdminInvite : undefined,
      allowAdminKick: typeof body.allowAdminKick === "boolean" ? body.allowAdminKick : undefined,
      allowAdminEditNotice: typeof body.allowAdminEditNotice === "boolean" ? body.allowAdminEditNotice : undefined,
      allowMemberUpload: typeof body.allowMemberUpload === "boolean" ? body.allowMemberUpload : undefined,
      allowMemberCall: typeof body.allowMemberCall === "boolean" ? body.allowMemberCall : undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "group_member_role") {
    const result = await setCommunityMessengerGroupMemberRole({
      userId: auth.userId,
      roomId,
      targetUserId: typeof body.targetUserId === "string" ? body.targetUserId : "",
      nextRole: body.nextRole === "admin" ? "admin" : "member",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "group_owner_transfer") {
    const result = await transferCommunityMessengerGroupOwner({
      userId: auth.userId,
      roomId,
      targetUserId: typeof body.targetUserId === "string" ? body.targetUserId : "",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "group_member_remove") {
    const result = await kickCommunityMessengerGroupMember({
      userId: auth.userId,
      roomId,
      targetUserId: typeof body.targetUserId === "string" ? body.targetUserId : "",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "context_meta") {
    const raw = body.contextMeta;
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ ok: false, error: "invalid_context_meta" }, { status: 400 });
    }
    let parsed;
    try {
      parsed = parseCommunityMessengerRoomContextMeta(JSON.stringify(raw));
    } catch {
      parsed = null;
    }
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "invalid_context_meta" }, { status: 400 });
    }
    const result = await updateCommunityMessengerRoomContextMeta({
      userId: auth.userId,
      roomId,
      contextMeta: parsed,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
}
