import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { type OpenChatErrorCode, updateOpenChatNickname } from "@/lib/open-chat/service";

function statusFromError(error: OpenChatErrorCode) {
  switch (error) {
    case "bad_request":
      return 400;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "already_joined":
    case "already_pending":
    case "room_unavailable":
    case "owner_cannot_leave":
      return 400;
    case "banned":
      return 403;
    default:
      return 500;
  }
}

function isSchemaMissingError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("open_chat_") || msg.includes("42P01");
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

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let body: { nickname?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await updateOpenChatNickname(sb, {
      roomId: id,
      userId: auth.userId,
      nickname: body.nickname ?? "",
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, message: result.message },
        { status: statusFromError(result.error) },
      );
    }

    return NextResponse.json({ ok: true, room: result.data });
  } catch (error) {
    if (isSchemaMissingError(error)) {
      return NextResponse.json({ ok: false, error: "schema_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
