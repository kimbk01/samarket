import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  getAdminBannerById,
  insertBannerChangeLog,
  listBannerChangeLogs,
  updateAdminBanner,
} from "@/lib/admin-banners/admin-banners-db";
import type { AdminBanner } from "@/lib/types/admin-banner";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  try {
    const [banner, logs] = await Promise.all([
      getAdminBannerById(sb, id),
      listBannerChangeLogs(sb, id, 50),
    ]);
    if (!banner) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, banner, logs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Partial<AdminBanner>;

  try {
    const banner = await updateAdminBanner(sb, id, body);
    const { data: prof } = await sb
      .from("profiles")
      .select("display_name, nickname, username")
      .eq("id", admin.userId)
      .maybeSingle();
    const nick = labelFromDisplayAndUsername(
      String(prof?.display_name ?? prof?.nickname ?? ""),
      String(prof?.username ?? "")
    );
    await insertBannerChangeLog(sb, {
      bannerId: id,
      actionType: "update",
      adminId: admin.userId,
      adminNickname: nick || "admin",
      note: "배너 수정",
    });
    return NextResponse.json({ ok: true, banner });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
