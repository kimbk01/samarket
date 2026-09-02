import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  listAdminNoteThreads,
  listMemberNoteThreads,
} from "@/lib/notifications/member-admin-notes-service";
import { enrichAdminNoteThreadsForDisplay } from "@/lib/notifications/admin-member-notes-display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const kindRaw = req.nextUrl.searchParams.get("kind")?.trim() ?? "";
  const kind = kindRaw === "inquiry" || kindRaw === "inbox" ? kindRaw : undefined;
  const memberUserId = req.nextUrl.searchParams.get("memberUserId")?.trim() ?? "";
  const res = memberUserId
    ? await listMemberNoteThreads(sb, memberUserId, kind ? { kind } : undefined)
    : await listAdminNoteThreads(sb, kind ? { kind } : undefined);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  const threads = await enrichAdminNoteThreadsForDisplay(sb, res.threads);
  return NextResponse.json({ ok: true, threads });
}

/** Create Inbox thread: Admin → member — A2-2 disabled (Support Center SSOT). */
export async function POST(req: NextRequest) {
  void req;
  return NextResponse.json(
    {
      ok: false,
      error: "legacy_writer_disabled",
      message: "Use /admin/support for new admin support messages.",
    },
    { status: 410 }
  );
}
