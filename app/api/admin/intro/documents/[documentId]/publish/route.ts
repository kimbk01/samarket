import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { publishIntroDocument } from "@/lib/intro/publish/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ documentId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { documentId } = await ctx.params;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  let idempotencyKey = `pub_${Date.now()}`;
  try {
    const body = (await req.json()) as { idempotencyKey?: string };
    if (typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()) {
      idempotencyKey = body.idempotencyKey.trim();
    }
  } catch {
    /* default key */
  }
  try {
    const published = await publishIntroDocument(sb, {
      documentId,
      userId: admin.userId,
      idempotencyKey,
    });
    return NextResponse.json({ ok: true as const, ...published });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "publish_failed" },
      { status: 500 },
    );
  }
}
