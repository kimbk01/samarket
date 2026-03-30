import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  createOpenChatRoom,
  type OpenChatErrorCode,
  listOpenChatRooms,
} from "@/lib/open-chat/service";

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

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const searchParams = req.nextUrl.searchParams;
  const q = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") === "latest" ? "latest" : "popular";
  const limit = Number(searchParams.get("limit") ?? 20);
  const mineOnly = searchParams.get("mine") === "1" || searchParams.get("mine") === "true";

  try {
    const rooms = await listOpenChatRooms(sb, auth.userId, { query: q, sort, limit, mineOnly });
    return NextResponse.json({ ok: true, rooms });
  } catch (error) {
    if (isSchemaMissingError(error)) {
      return NextResponse.json({ ok: false, error: "schema_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  let body: {
    title?: string;
    description?: string | null;
    thumbnailUrl?: string | null;
    visibility?: "public" | "private";
    requiresApproval?: boolean;
    maxMembers?: number;
    allowSearch?: boolean;
    entryQuestion?: string | null;
    ownerNickname?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await createOpenChatRoom(sb, {
      creatorUserId: auth.userId,
      title: body.title ?? "",
      description: body.description,
      thumbnailUrl: body.thumbnailUrl,
      visibility: body.visibility,
      requiresApproval: body.requiresApproval,
      maxMembers: body.maxMembers,
      allowSearch: body.allowSearch,
      entryQuestion: body.entryQuestion,
      ownerNickname: body.ownerNickname,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, message: result.message },
        { status: statusFromError(result.error) },
      );
    }

    return NextResponse.json({ ok: true, room: result.data }, { status: 201 });
  } catch (error) {
    if (isSchemaMissingError(error)) {
      return NextResponse.json({ ok: false, error: "schema_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
