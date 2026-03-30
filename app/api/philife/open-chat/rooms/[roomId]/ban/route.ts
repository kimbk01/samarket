import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { banOpenChatMember, type OpenChatErrorCode } from "@/lib/open-chat/service";

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
  params: Promise<{ roomId: string }>;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId } = await ctx.params;
  const id = roomId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { userId?: string; reason?: string | null };
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

  const result = await banOpenChatMember(sb, {
    roomId: id,
    actorUserId: auth.userId,
    userId: String(body.userId ?? ""),
    reason: body.reason,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: statusFromError(result.error) });
  }
  return NextResponse.json({ ok: true, room: result.data });
}
