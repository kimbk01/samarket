import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  listExternalBoardSources,
  upsertExternalBoardSource,
} from "@/lib/external-board-import/registry/source-board-store";
import type { ExternalBoardMode } from "@/lib/external-board-import/product-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const sb = getSupabaseServer();
    const sources = await listExternalBoardSources(sb);
    return NextResponse.json({ ok: true, sources });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const sourceUrl = String(body.sourceUrl ?? "").trim();
    if (!sourceUrl) {
      return NextResponse.json({ ok: false, error: "sourceUrl_required" }, { status: 400 });
    }
    const sb = getSupabaseServer();
    const source = await upsertExternalBoardSource(sb, {
      sourceUrl,
      sourceBoardName: body.sourceBoardName != null ? String(body.sourceBoardName) : undefined,
      siteName: body.siteName != null ? String(body.siteName) : undefined,
      mode: (String(body.mode ?? "MANUAL") === "AUTO" ? "AUTO" : "MANUAL") as ExternalBoardMode,
      rightsBasis: body.rightsBasis != null ? String(body.rightsBasis) : null,
      rightsStatus: body.rightsStatus as "missing" | "declared" | "rejected" | undefined,
      targetTopicId: body.targetTopicId != null ? String(body.targetTopicId) : null,
      targetTopicSlug: body.targetTopicSlug != null ? String(body.targetTopicSlug) : null,
      targetLocationId: body.targetLocationId != null ? String(body.targetLocationId) : null,
      targetRegionLabel: body.targetRegionLabel != null ? String(body.targetRegionLabel) : null,
      authorPoolId: body.authorPoolId != null ? String(body.authorPoolId) : null,
      attributionRequired: body.attributionRequired != null ? Boolean(body.attributionRequired) : false,
      attributionDisplayName:
        body.attributionDisplayName != null ? String(body.attributionDisplayName) : null,
      boardSequenceVerified:
        body.boardSequenceVerified != null ? Boolean(body.boardSequenceVerified) : false,
    });
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    const msg = String((e as Error).message);
    const status = msg === "source_board_duplicate" || msg === "invalid_source_url" ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
