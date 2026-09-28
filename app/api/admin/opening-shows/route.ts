import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { listOpeningShows } from "@/lib/opening-show/admin-loader.server";
import { createOpeningShow } from "@/lib/opening-show/admin-writer.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const result = await listOpeningShows(sb);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: result.items });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const result = await createOpeningShow(sb, {
    adminUserId: admin.userId,
    title: String(body.title ?? ""),
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
