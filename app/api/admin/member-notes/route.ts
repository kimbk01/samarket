import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  createAdminNoteThread,
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

/** Create Inbox thread: Admin → exactly one member. */
export async function POST(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as {
    memberUserId?: string;
    member_user_id?: string;
    subject?: string;
    body?: string;
  };
  const memberUserId = String(body.memberUserId ?? body.member_user_id ?? "").trim();
  const res = await createAdminNoteThread(sb, {
    memberUserId,
    adminUserId: auth.userId,
    subject: String(body.subject ?? ""),
    body: String(body.body ?? ""),
  });
  if (!res.ok) {
    const status = res.error === "missing_table" ? 503 : res.error === "invalid_input" ? 400 : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, thread: res.thread });
}
