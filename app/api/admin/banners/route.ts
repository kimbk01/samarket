import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  insertAdminBanner,
  insertBannerChangeLog,
  listAdminBanners,
} from "@/lib/admin-banners/admin-banners-db";
import type { AdminBanner } from "@/lib/types/admin-banner";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: true, banners: [] });
  try {
    const banners = await listAdminBanners(sb);
    return NextResponse.json({ ok: true, banners });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Partial<AdminBanner>;
  try {
    const { data: prof } = await sb
      .from("profiles")
      .select("display_name, nickname, username")
      .eq("id", admin.userId)
      .maybeSingle();
    const nick = labelFromDisplayAndUsername(
      String(prof?.display_name ?? prof?.nickname ?? ""),
      String(prof?.username ?? "")
    );

    const banner = await insertAdminBanner(sb, { ...body, createdBy: admin.userId });
    await insertBannerChangeLog(sb, {
      bannerId: banner.id,
      actionType: "create",
      adminId: admin.userId,
      adminNickname: nick || "admin",
      note: "배너 생성",
    });
    return NextResponse.json({ ok: true, banner });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
