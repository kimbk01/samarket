import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  extForOpeningMime,
  normalizeOpeningMimeHint,
} from "@/lib/opening-show/media-validate";
import {
  OPENING_SHOW_BUCKET,
  openingSourcePath,
} from "@/lib/opening-show/storage";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    showId?: string;
    mime?: string;
    fileName?: string;
  };
  const showId = String(body.showId ?? "").trim();
  const mime = normalizeOpeningMimeHint(String(body.mime ?? ""));
  const fileName = String(body.fileName ?? "").trim() || "image";
  if (!showId || !mime) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const { data: show, error: showError } = await sb
    .from("opening_shows")
    .select("id")
    .eq("id", showId)
    .maybeSingle();
  if (showError) {
    return NextResponse.json({ ok: false, error: showError.message }, { status: 500 });
  }
  if (!show) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const mediaId = randomUUID();
  const path = openingSourcePath(showId, mediaId, extForOpeningMime(mime));
  const { data, error } = await sb.storage.from(OPENING_SHOW_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: error?.message || "sign_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    mediaId,
    path,
    signedUrl: data.signedUrl,
    token: data.token ?? "",
    mime,
    fileName,
  });
}
