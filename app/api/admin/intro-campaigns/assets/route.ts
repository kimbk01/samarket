import { NextRequest, NextResponse } from "next/server";
import { requireIntroAdminContext } from "@/lib/startup/intro-v2/admin-api-context";
import { registerIntroAdminAsset } from "@/lib/startup/intro-v2/admin-service";
import { introMediaKindFromMime } from "@/lib/startup/intro-v2/admin-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function storagePathFromPublicUrl(url: string): string {
  const marker = "/storage/v1/object/public/";
  const idx = url.indexOf(marker);
  if (idx < 0) return url;
  const rest = url.slice(idx + marker.length);
  const slash = rest.indexOf("/");
  return slash >= 0 ? rest.slice(slash + 1) : rest;
}

export async function POST(req: NextRequest) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const body = (await req.json().catch(() => ({}))) as {
    publicUrl?: string;
    mime?: string | null;
    bytes?: number | null;
    width?: number | null;
    height?: number | null;
  };
  const publicUrl = String(body.publicUrl ?? "").trim();
  if (!publicUrl.startsWith("https://")) {
    return NextResponse.json({ ok: false, error: "public_url_required" }, { status: 400 });
  }
  const mime = body.mime ?? null;
  if (introMediaKindFromMime(mime) !== "image") {
    return NextResponse.json({ ok: false, error: "media_pipeline_not_ready" }, { status: 400 });
  }
  const registered = await registerIntroAdminAsset(ctx.sb, {
    publicUrl,
    storagePath: storagePathFromPublicUrl(publicUrl),
    mime,
    bytes: body.bytes ?? null,
    width: body.width ?? null,
    height: body.height ?? null,
  });
  if (!registered.ok) {
    return NextResponse.json({ ok: false, error: registered.error }, { status: registered.httpStatus });
  }
  return NextResponse.json({ ok: true, asset: registered.asset });
}
