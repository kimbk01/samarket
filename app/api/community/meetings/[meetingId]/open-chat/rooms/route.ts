import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isUserJoinedMeetingMember } from "@/lib/community-meeting-open-chat/meeting-member-guard";
import {
  createCommunityChatRoom,
  listCommunityChatRoomsForMeeting,
} from "@/lib/community-meeting-open-chat/rooms-service";
import type { CommunityChatJoinType } from "@/lib/community-meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string }> };

function joinTypeFromBody(v: unknown): CommunityChatJoinType | null {
  if (v === "public" || v === "password" || v === "approval") return v;
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
  const list = await listCommunityChatRoomsForMeeting(sb, mid, { search });
  if (!list.ok) {
    const status = list.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: list.error }, { status });
  }

  return NextResponse.json({ ok: true, rooms: list.rooms });
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

  const created = await createCommunityChatRoom(sb, {
    meetingId: mid,
    creatorUserId: auth.userId,
    title: typeof body.title === "string" ? body.title : "",
    description: typeof body.description === "string" ? body.description : "",
    thumbnailUrl: typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : null,
    joinType,
    joinPasswordPlain: typeof body.joinPassword === "string" ? body.joinPassword : null,
    maxMembers: typeof body.maxMembers === "number" ? body.maxMembers : Number(body.maxMembers) || 300,
    isSearchable: body.isSearchable !== false,
    reportThreshold:
      body.reportThreshold === null || body.reportThreshold === undefined
        ? null
        : Number(body.reportThreshold),
    ownerNickname: typeof body.nickname === "string" ? body.nickname : "",
    ownerAvatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : null,
  });

  if (!created.ok) {
    const st =
      created.status === 400
        ? 400
        : created.status === 503
          ? 503
          : 500;
    return NextResponse.json({ ok: false, error: created.error }, { status: st });
  }

  return NextResponse.json({ ok: true, room: created.room });
}
