import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { createAdminDirectPopupComplete } from "@/lib/platform-popup/admin-direct-complete-create";
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

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ ok: false, error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  }

  const name = String(form.get("name") ?? "").trim();
  const startAt = String(form.get("startAt") ?? "").trim();
  const endAt = String(form.get("endAt") ?? "").trim();
  const ctaTarget = String(form.get("ctaTarget") ?? "").trim();
  const altText = String(form.get("altText") ?? "").trim() || null;
  const publishMode = String(form.get("publishMode") ?? "");
  const surfacesRaw = String(form.get("surfaces") ?? "[]");
  let surfaces: string[] = [];
  try {
    const parsed = JSON.parse(surfacesRaw) as unknown;
    surfaces = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return NextResponse.json({ ok: false, error: "surfaces_invalid" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  }
  if (publishMode !== "live" && publishMode !== "scheduled") {
    return NextResponse.json({ ok: false, error: "publish_mode_invalid" }, { status: 400 });
  }

  const result = await createAdminDirectPopupComplete(sb, {
    adminUserId: admin.userId,
    name,
    surfaces: surfaces.length ? surfaces : ["GLOBAL"],
    startAt,
    endAt,
    ctaTarget,
    file,
    publishMode,
    altText,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        incomplete: result.incomplete,
        id: result.id,
        error: result.error,
      },
      { status: result.httpStatus ?? 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    status: result.status,
    detailHref: `/admin/platform-popup/${encodeURIComponent(result.id)}`,
  });
}
