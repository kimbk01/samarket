import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getExternalBoardSource,
  patchExternalBoardSource,
} from "@/lib/external-board-import/registry/source-board-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const sb = getSupabaseServer();
    const source = await getExternalBoardSource(sb, id);
    if (!source) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const sb = getSupabaseServer();
    const source = await patchExternalBoardSource(sb, id, {
      mode: body.mode === "AUTO" ? "AUTO" : body.mode === "MANUAL" ? "MANUAL" : undefined,
      rightsBasis: body.rightsBasis != null ? String(body.rightsBasis) : undefined,
      rightsStatus: body.rightsStatus as "missing" | "declared" | "rejected" | undefined,
      targetTopicId: body.targetTopicId != null ? String(body.targetTopicId) : undefined,
      targetTopicSlug: body.targetTopicSlug != null ? String(body.targetTopicSlug) : undefined,
      targetLocationId: body.targetLocationId != null ? String(body.targetLocationId) : undefined,
      targetRegionLabel: body.targetRegionLabel != null ? String(body.targetRegionLabel) : undefined,
      authorPoolId: body.authorPoolId != null ? String(body.authorPoolId) : undefined,
      attributionRequired:
        body.attributionRequired != null ? Boolean(body.attributionRequired) : undefined,
      attributionDisplayName:
        body.attributionDisplayName != null ? String(body.attributionDisplayName) : undefined,
      boardSequenceVerified:
        body.boardSequenceVerified != null ? Boolean(body.boardSequenceVerified) : undefined,
      sourceBoardName: body.sourceBoardName != null ? String(body.sourceBoardName) : undefined,
      dateRecentMinDays: body.dateRecentMinDays != null ? Number(body.dateRecentMinDays) : undefined,
      dateRecentMaxDays: body.dateRecentMaxDays != null ? Number(body.dateRecentMaxDays) : undefined,
      viewSeedMin: body.viewSeedMin != null ? Number(body.viewSeedMin) : undefined,
      viewSeedMax: body.viewSeedMax != null ? Number(body.viewSeedMax) : undefined,
    });
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
