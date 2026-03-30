import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { normalizeSectionSlug } from "@/lib/community-feed/constants";
import {
  PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY,
  getPhilifeNeighborhoodSectionSlugServer,
} from "@/lib/community-feed/philife-neighborhood-section";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const slug = await getPhilifeNeighborhoodSectionSlugServer();
    return NextResponse.json({ ok: true, section_slug: slug });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { section_slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const candidate = normalizeSectionSlug(body.section_slug ?? "");
  if (!candidate) {
    return NextResponse.json({ ok: false, error: "section_slug_required" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const { data: sec, error: e1 } = await sb
      .from("community_sections")
      .select("slug")
      .eq("slug", candidate)
      .eq("is_active", true)
      .maybeSingle();
    if (e1 || !sec) {
      return NextResponse.json({ ok: false, error: "unknown_or_inactive_section" }, { status: 400 });
    }

    const { error } = await sb.from("admin_settings").upsert(
      {
        key: PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY,
        value_json: { section_slug: candidate },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (error) {
      if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
        return NextResponse.json({ ok: false, error: "admin_settings_table_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, section_slug: candidate });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
