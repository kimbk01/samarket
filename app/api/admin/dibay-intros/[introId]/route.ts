import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadDibayIntro, saveDibayIntroDocument } from "@/lib/dibay-intro/admin-store";
import { parseDibayIntroDocument } from "@/lib/dibay-intro/document";
import { listDibayIntroMedia } from "@/lib/dibay-intro/media-store";
import { dibayIntroApiError } from "@/lib/dibay-intro/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ introId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { introId } = await ctx.params;
  try {
    const intro = await loadDibayIntro(introId);
    const media = await listDibayIntroMedia(introId);
    return NextResponse.json({ ok: true, intro, media });
  } catch (error) {
    return dibayIntroApiError(error);
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { introId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { title?: string; document?: unknown };
  const parsed = parseDibayIntroDocument(body.document);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: "invalid_document", issues: parsed.issues }, { status: 400 });
  }
  try {
    const intro = await saveDibayIntroDocument(introId, admin.userId, String(body.title ?? ""), parsed.document);
    const media = await listDibayIntroMedia(introId);
    return NextResponse.json({ ok: true, intro, media });
  } catch (error) {
    return dibayIntroApiError(error);
  }
}
