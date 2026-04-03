import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isUserJoinedMeetingMember } from "@/lib/community-meeting-open-chat/meeting-member-guard";
import { fetchViewerOpenChatIdentity } from "@/lib/meeting-open-chat/fetch-viewer-open-chat-identity";
import { enrichMeetingOpenChatRoomsListWithViewer } from "@/lib/meeting-open-chat/read-service";
import {
  createMeetingOpenChatRoom,
  ensureAndGetDefaultMeetingOpenChatRoomId,
  listMeetingOpenChatRoomsForMeeting,
} from "@/lib/meeting-open-chat/rooms-service";
import type { MeetingOpenChatIdentityMode, MeetingOpenChatJoinAs, MeetingOpenChatJoinType } from "@/lib/meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string }> };

function joinTypeFromBody(v: unknown): MeetingOpenChatJoinType | null {
  if (v === "free" || v === "password" || v === "approval" || v === "password_approval") return v;
  return null;
}

function identityModeFromBody(v: unknown): MeetingOpenChatIdentityMode | null {
  if (v === "realname" || v === "nickname_optional") return v;
  return null;
}

function joinAsFromBody(v: unknown): MeetingOpenChatJoinAs | null {
  if (v === "realname" || v === "nickname") return v;
  return null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  if (!mid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const allowed = await isUserJoinedMeetingMember(sb, mid, auth.userId);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const search = req.nextUrl.searchParams.get("search")?.trim() ?? null;
  if (!search) {
    await ensureAndGetDefaultMeetingOpenChatRoomId(sb, mid);
  }

  const list = await listMeetingOpenChatRoomsForMeeting(sb, mid, { search });
  if (!list.ok) {
    const status = list.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: list.error }, { status });
  }

  const enriched = await enrichMeetingOpenChatRoomsListWithViewer(sb, list.rooms, auth.userId);
  if (!enriched.ok) {
    const status = enriched.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: enriched.error }, { status });
  }

  const viewerIdentity = await fetchViewerOpenChatIdentity(sb, auth.userId);

  return NextResponse.json({
    ok: true,
    rooms: enriched.rooms,
    viewerSuggestedOpenNickname: viewerIdentity.suggestedNickname,
    viewerSuggestedRealname: viewerIdentity.suggestedRealname,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  if (!mid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const allowed = await isUserJoinedMeetingMember(sb, mid, auth.userId);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const joinType = joinTypeFromBody(body.joinType);
  if (!joinType) {
    return NextResponse.json({ ok: false, error: "join_type_invalid" }, { status: 400 });
  }
  const identityMode = identityModeFromBody(body.identityMode);
  if (!identityMode) {
    return NextResponse.json({ ok: false, error: "identity_mode_invalid" }, { status: 400 });
  }

  const created = await createMeetingOpenChatRoom(sb, {
    meetingId: mid,
    creatorUserId: auth.userId,
    title: typeof body.title === "string" ? body.title : "",
    description: typeof body.description === "string" ? body.description : "",
    thumbnailUrl: typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : null,
    joinType,
    identityMode,
    joinPasswordPlain: typeof body.joinPassword === "string" ? body.joinPassword : null,
    maxMembers: typeof body.maxMembers === "number" ? body.maxMembers : Number(body.maxMembers) || 300,
    isSearchable: body.isSearchable !== false,
    allowRejoinAfterKick: body.allowRejoinAfterKick !== false,
    ownerJoinAs: joinAsFromBody(body.ownerJoinAs),
    ownerOpenNickname: typeof body.openNickname === "string" ? body.openNickname : "",
    ownerOpenProfileImageUrl: typeof body.openProfileImageUrl === "string" ? body.openProfileImageUrl : null,
    ownerIntroMessage: typeof body.introMessage === "string" ? body.introMessage : "",
  });

  if (!created.ok) {
    const st =
      created.status === 400 ? 400 : created.status === 501 ? 501 : created.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: created.error }, { status: st });
  }

  return NextResponse.json({ ok: true, room: created.room });
}
