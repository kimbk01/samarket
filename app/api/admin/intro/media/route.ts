import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import {
  listReadyIntroMedia,
  softDeleteIntroMedia,
  uploadAndReadyIntroMedia,
} from "@/lib/intro/media/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const items = await listReadyIntroMedia(sb);
    return NextResponse.json({ ok: true as const, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "list_failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
    }
    const asLogo = form.get("asLogo") === "1" || form.get("asLogo") === "true";
    const bytes = Buffer.from(await file.arrayBuffer());
    const item = await uploadAndReadyIntroMedia(sb, {
      bytes,
      originalName: file.name || "upload",
      userId: admin.userId,
      asLogo,
    });
    return NextResponse.json({ ok: true as const, item });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "upload_failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const mediaId = req.nextUrl.searchParams.get("mediaId");
  if (!mediaId) {
    return NextResponse.json({ ok: false, error: "mediaId_required" }, { status: 400 });
  }
  try {
    await softDeleteIntroMedia(sb, mediaId);
    return NextResponse.json({ ok: true as const, deleted: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "delete_failed";
    const status = msg === "media_not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
