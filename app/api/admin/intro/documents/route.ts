import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  createIntroDocument,
  listIntroDocuments,
} from "@/lib/intro/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/intro/documents — list canonical drafts. */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 503 },
    );
  }

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 100;

  try {
    const items = await listIntroDocuments({ sb, limit });
    return NextResponse.json({ ok: true as const, items });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "list_failed",
        message: err instanceof Error ? err.message : "list_failed",
      },
      { status: 500 },
    );
  }
}

/** POST /api/admin/intro/documents — create real persisted Intro draft. */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 503 },
    );
  }

  let body: { title?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const created = await createIntroDocument({
      sb,
      userId: admin.userId,
      title: body.title,
    });
    return NextResponse.json({ ok: true as const, ...created });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "create_failed",
        message: err instanceof Error ? err.message : "create_failed",
      },
      { status: 500 },
    );
  }
}
