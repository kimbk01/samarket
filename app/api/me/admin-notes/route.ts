import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  listMemberNoteThreads,
} from "@/lib/notifications/member-admin-notes-service";
import type { MemberAdminNoteKind } from "@/lib/notifications/member-admin-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseKind(raw: string | null): MemberAdminNoteKind | undefined {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "inquiry" || v === "inbox") return v;
  return undefined;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  const kind = parseKind(req.nextUrl.searchParams.get("kind"));
  const res = await listMemberNoteThreads(sb, auth.userId, kind ? { kind } : undefined);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, threads: res.threads });
}

export async function POST(req: NextRequest) {
  // A2-1: Member/Owner new CS compose cut over to support_cases only.
  void req;
  return NextResponse.json(
    {
      ok: false,
      error: "legacy_writer_disabled",
      message: "Use Support Center (support_cases) for new inquiries.",
    },
    { status: 410 }
  );
}
