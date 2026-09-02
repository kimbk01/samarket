import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  getNoteThreadWithMessages,
  markAdminNoteThreadRead,
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
  // A2-2: legacy Care write disabled — Support Center is SSOT.
  void req;
  void ctx;
  return NextResponse.json(
    {
      ok: false,
      error: "legacy_writer_disabled",
      message: "Use /admin/support for new admin support replies.",
    },
    { status: 410 }
  );
}
