import { NextRequest, NextResponse } from "next/server";
import { INTRO_V3_SOURCE_MAX_BYTES } from "@/lib/startup/intro-v3/media-policy";
import { rejectIntroV3SourceByNameOrType, sniffIntroV3StillMime } from "@/lib/startup/intro-v3/still-process.server";
import { requireIntroAdminContext, signIntroV3SourceUpload } from "@/lib/startup/intro-v3/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ctx = await requireIntroAdminContext();
  if (!ctx.ok) return ctx.response;
  const body = (await req.json().catch(() => ({}))) as {
    filename?: string;
    mime?: string;
    bytes?: number;
  };
  const filename = String(body.filename ?? "").trim();
  const bytes = Number(body.bytes ?? 0);
  if (!filename || !(bytes > 0)) {
    return NextResponse.json({ ok: false, error: "unsupported_format" }, { status: 400 });
  }
  if (bytes > INTRO_V3_SOURCE_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "source_too_large" }, { status: 413 });
  }
  const rejected = rejectIntroV3SourceByNameOrType({ name: filename, type: body.mime });
  if (rejected) {
    return NextResponse.json({ ok: false, error: rejected }, { status: 400 });
  }
  const mime = sniffIntroV3StillMime({ name: filename, type: body.mime });
  if (!mime) {
    return NextResponse.json({ ok: false, error: "unsupported_format" }, { status: 400 });
  }
  const signed = await signIntroV3SourceUpload(ctx.sb, {
    adminUserId: ctx.userId,
    filename,
    mime,
    bytes,
  });
  if (!signed.ok) {
    return NextResponse.json({ ok: false, error: signed.error }, { status: signed.httpStatus });
  }
  return NextResponse.json({
    ok: true,
    sourceId: signed.sourceId,
    path: signed.path,
    signedUrl: signed.signedUrl,
    token: signed.token,
  });
}
