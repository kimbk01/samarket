import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  deleteOpenChatNotice,
  type OpenChatErrorCode,
  updateOpenChatNotice,
} from "@/lib/open-chat/service";

function statusFromError(error: OpenChatErrorCode) {
  switch (error) {
    case "bad_request":
      return 400;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "banned":
      return 403;
    default:
      return 500;
  }
}

interface Ctx {
  params: Promise<{ roomId: string; noticeId: string }>;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId, noticeId } = await ctx.params;
  const id = roomId?.trim();
  const nid = noticeId?.trim();
  if (!id || !nid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { title?: string; body?: string; visibility?: "members" | "public"; isPinned?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const result = await updateOpenChatNotice(sb, {
    roomId: id,
    actorUserId: auth.userId,
    noticeId: nid,
    title: body.title,
    body: body.body,
    visibility: body.visibility,
    isPinned: body.isPinned,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: statusFromError(result.error) });
  }
  return NextResponse.json({ ok: true, room: result.data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId, noticeId } = await ctx.params;
  const id = roomId?.trim();
  const nid = noticeId?.trim();
  if (!id || !nid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const result = await deleteOpenChatNotice(sb, {
    roomId: id,
    actorUserId: auth.userId,
    noticeId: nid,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: statusFromError(result.error) });
  }
  return NextResponse.json({ ok: true, room: result.data });
}
