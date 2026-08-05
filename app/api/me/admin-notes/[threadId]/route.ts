import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  archiveMemberNoteThread,
  getNoteThreadWithMessages,
  markMemberNoteThreadRead,
  postNoteMessage,
} from "@/lib/notifications/member-admin-notes-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ threadId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
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
  if (res.thread.member_user_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  await markMemberNoteThreadRead(sb, { threadId, memberUserId: auth.userId });
  return NextResponse.json({
    ok: true,
    thread: { ...res.thread, member_unread_count: 0 },
    messages: res.messages,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
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
    senderRole: "member",
    senderUserId: auth.userId,
    body: String(body.body ?? ""),
  });
  if (!res.ok) {
    const status =
      res.error === "forbidden" ? 403 : res.notFound ? 404 : res.error === "invalid_input" ? 400 : 500;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, message: res.message });
}

/** Soft-archive (member hide). Body `{ archive: true }` or DELETE. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { threadId: raw } = await ctx.params;
  const threadId = String(raw ?? "").trim();
  if (!threadId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { archive?: boolean };
  if (body.archive !== true) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const res = await archiveMemberNoteThread(sb, { threadId, memberUserId: auth.userId });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error },
      { status: res.notFound ? 404 : 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { threadId: raw } = await ctx.params;
  const threadId = String(raw ?? "").trim();
  if (!threadId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const res = await archiveMemberNoteThread(sb, { threadId, memberUserId: auth.userId });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error },
      { status: res.notFound ? 404 : 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
