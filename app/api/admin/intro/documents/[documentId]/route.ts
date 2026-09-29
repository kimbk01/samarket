import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import {
  getIntroDocument,
  saveIntroDocument,
} from "@/lib/intro/document/service";
import type { IntroDocumentV1 } from "@/lib/intro/contracts/document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ documentId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { documentId } = await ctx.params;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const document = await getIntroDocument(sb, documentId);
    if (!document) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true as const, document });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "get_failed" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { documentId } = await ctx.params;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  let body: {
    expectedDraftVersion?: number;
    document?: IntroDocumentV1;
    title?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  if (
    typeof body.expectedDraftVersion !== "number" ||
    !body.document ||
    typeof body.document !== "object"
  ) {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }
  try {
    const document = await saveIntroDocument(sb, {
      documentId,
      expectedDraftVersion: body.expectedDraftVersion,
      document: body.document,
      title: body.title,
      userId: admin.userId,
    });
    return NextResponse.json({ ok: true as const, document });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save_failed";
    const status = (e as { status?: number }).status === 409 ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
