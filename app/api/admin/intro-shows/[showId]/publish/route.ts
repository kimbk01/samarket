import { NextRequest, NextResponse } from "next/server";
import { parseIntroShowDocument } from "@/intro-engine";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { insertPublishedRevision, requireReadyMediaIds } from "@/lib/intro-show/admin-store";
import { buildSealedIntroPack, introEngineRuntimeHash, readIntroEngineRuntimeJs } from "@/lib/intro-show/pack-builder";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ showId: string }> },
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const { showId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { document?: unknown };
  const document = parseIntroShowDocument(body.document);
  if (!document) return NextResponse.json({ ok: false, error: "document_invalid" }, { status: 400 });
  const hasLogo = document.scene.layers.some((layer) => layer.type === "LOGO");
  const hasImage = document.scene.layers.some((layer) => layer.type === "IMAGE");
  if (!hasLogo || !hasImage) {
    return NextResponse.json({ ok: false, error: "layers_required" }, { status: 400 });
  }
  try {
    await requireReadyMediaIds(
      sb,
      showId,
      document.scene.layers.map((layer) => layer.mediaId),
    );
    const engineJs = readIntroEngineRuntimeJs();
    const engineHash = introEngineRuntimeHash(engineJs);
    const published = await insertPublishedRevision(sb, {
      campaignId: showId,
      adminUserId: admin.userId,
      document,
      engineHash,
      packChecksum: "pending",
    });
    const pack = await buildSealedIntroPack(sb, {
      revisionId: published.revisionId,
      campaignId: showId,
      document,
      documentChecksum: published.documentChecksum,
    });
    await sb
      .from("intro_show_revisions")
      .update({ pack_checksum: pack.identity.packChecksum, engine_hash: pack.identity.engineHash })
      .eq("id", published.revisionId);
    return NextResponse.json({
      ok: true,
      revisionId: published.revisionId,
      documentChecksum: published.documentChecksum,
      engineHash: pack.identity.engineHash,
      packChecksum: pack.identity.packChecksum,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "publish_failed";
    const status =
      message === "media_not_ready" || message === "runtime_asset_not_ready" || message === "media_required"
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
