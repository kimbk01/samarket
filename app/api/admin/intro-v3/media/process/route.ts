import { NextRequest, NextResponse } from "next/server";
import {
  loadIntroV3SourcePath,
  markIntroV3SourceFailed,
  persistIntroV3ProcessedStill,
  requireIntroAdminContext,
} from "@/lib/startup/intro-v3/admin-service";
import { INTRO_V3_STORAGE_BUCKET, type IntroV3ProcessErrorCode } from "@/lib/startup/intro-v3/media-policy";
import { processIntroV3StillBuffer } from "@/lib/startup/intro-v3/still-process.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(
  code: IntroV3ProcessErrorCode,
  status = 400
): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status });
}

export async function POST(req: NextRequest) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const body = (await req.json().catch(() => ({}))) as { sourceId?: string };
  const sourceId = String(body.sourceId ?? "").trim();
  if (!sourceId) return fail("asset_persistence_failed");

  const loaded = await loadIntroV3SourcePath(ctx.sb, sourceId);
  if (!loaded.ok) {
    return fail("asset_persistence_failed", 404);
  }

  const storage = ctx.sb.storage?.from(INTRO_V3_STORAGE_BUCKET);
  if (!storage) return fail("storage_failed", 503);

  await ctx.sb.from("intro_v3_media_sources").update({ status: "processing" }).eq("id", sourceId);

  const downloaded = await storage.download(loaded.path);
  if (downloaded.error || !downloaded.data) {
    await markIntroV3SourceFailed(ctx.sb, sourceId, "storage_failed");
    return fail("storage_failed", 500);
  }

  const buffer = Buffer.from(await downloaded.data.arrayBuffer());
  const processed = await processIntroV3StillBuffer({
    buffer,
    sourceBytes: buffer.length,
    filename: loaded.filename,
    mime: loaded.mime,
  });
  if (!processed.ok) {
    await markIntroV3SourceFailed(ctx.sb, sourceId, processed.error);
    return fail(processed.error, processed.error === "source_too_large" ? 413 : 400);
  }

  const persisted = await persistIntroV3ProcessedStill(ctx.sb, {
    sourceId,
    sourcePath: loaded.path,
    filename: loaded.filename,
    mime: loaded.mime,
    sourceBytes: buffer.length,
    sourceWidth: processed.sourceWidth,
    sourceHeight: processed.sourceHeight,
    orientationDeg: processed.orientationDeg,
    derivativeBuffer: processed.buffer,
    derivativeWidth: processed.width,
    derivativeHeight: processed.height,
    derivativeBytes: processed.bytes,
  });
  if (!persisted.ok) {
    return fail(persisted.error, persisted.httpStatus);
  }

  return NextResponse.json({
    ok: true,
    source: persisted.source,
    derivative: persisted.derivative,
    mediaRef: { sourceId: persisted.source.id, derivativeId: persisted.derivative.id },
  });
}
