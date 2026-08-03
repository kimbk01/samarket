import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  getNoteThreadWithMessages,
  markAdminNoteThreadRead,
  postNoteMessage,
} from "@/lib/notifications/member-admin-notes-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { threadId: raw } = await ctx.params;
  const threadId = String(raw ?? "").trim();
  if (!threadId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const res = await getNoteThreadWithMessages(sb, threadId);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error },
      { status: res.notFound ? 404 : 500 }
    );
  }
  await markAdminNoteThreadRead(sb, threadId);
  return NextResponse.json({
    ok: true,
    thread: { ...res.thread, admin_unread_count: 0 },
    messages: res.messages,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { threadId: raw } = await ctx.params;
  const threadId = String(raw ?? "").trim();
  if (!threadId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const res = await postNoteMessage(sb, {
    threadId,
    senderRole: "admin",
    senderUserId: auth.userId,
    body: String(body.body ?? ""),
  });
  if (!res.ok) {
    const status = res.notFound ? 404 : res.error === "invalid_input" ? 400 : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, message: res.message });
}
