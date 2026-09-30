import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import {
  createIntroDocument,
  listIntroOperatorDocuments,
} from "@/lib/intro/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const documents = await listIntroOperatorDocuments(sb);
    return NextResponse.json({ ok: true as const, documents });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "list_failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  let title = "Intro";
  try {
    // Canonical field = title. Boundary adapter only: accept legacy `name` → title.
    const body = (await req.json()) as { title?: string; name?: string };
    if (typeof body.title === "string" && body.title.trim()) {
      title = body.title.trim();
    } else if (typeof body.name === "string" && body.name.trim()) {
      title = body.name.trim();
    }
  } catch {
    /* default title */
  }
  try {
    const document = await createIntroDocument(sb, {
      title,
      userId: admin.userId,
    });
    return NextResponse.json({ ok: true as const, document });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "create_failed" },
      { status: 500 },
    );
  }
}
