import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { canUserViewMeetingEvents } from "@/lib/neighborhood/meeting-events-access";
import { listMeetingEventsPage } from "@/lib/neighborhood/queries";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit"));
  const offsetRaw = Number(url.searchParams.get("offset"));
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 30)
    : 15;
  const offset = Number.isFinite(offsetRaw)
    ? Math.min(Math.max(Math.floor(offsetRaw), 0), 2000)
    : 0;
  const eventType = url.searchParams.get("type")?.trim() || null;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const allowed = await canUserViewMeetingEvents(sb, id, auth.userId);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data: exists } = await sb.from("meetings").select("id").eq("id", id).maybeSingle();
  if (!(exists as { id?: string } | null)?.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { events, hasMore } = await listMeetingEventsPage(id, { limit, offset, eventType });
  return NextResponse.json({ ok: true, events, hasMore, offset, limit });
}
