import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { normalizeSectionSlug } from "@/lib/community-feed/constants";
import {
  PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY,
  getPhilifeNeighborhoodSectionSettingsV1Server,
  getPhilifeNeighborhoodSectionSlugServer,
  getPhilifeShowAllFeedTabServer,
  getPhilifeShowNeighborOnlyFilterServer,
} from "@/lib/community-feed/philife-neighborhood-section";
import { planPhilifeNeighborhoodSectionPatch } from "@/lib/community-feed/plan-philife-neighborhood-section-patch";
import { clearPhilifeDefaultSectionTopicsCache } from "@/lib/neighborhood/philife-neighborhood-topics";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const [slug, show, showNeighbor] = await Promise.all([
      getPhilifeNeighborhoodSectionSlugServer(),
      getPhilifeShowAllFeedTabServer(),
      getPhilifeShowNeighborOnlyFilterServer(),
    ]);
    return NextResponse.json({
      ok: true,
      section_slug: slug,
      show_all_feed_tab: show,
      show_neighbor_only_filter: showNeighbor,
    });
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

    const prev = await getPhilifeNeighborhoodSectionSettingsV1Server(sb);
    const { error } = await sb.from("admin_settings").upsert(
      {
        key: PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY,
        value_json: { ...prev, section_slug: candidate },
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
    clearPhilifeDefaultSectionTopicsCache();
    revalidatePath("/philife", "page");
    return NextResponse.json({ ok: true, section_slug: candidate });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  let body: { show_all_feed_tab?: boolean; show_neighbor_only_filter?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const plan = planPhilifeNeighborhoodSectionPatch(body);
  if (!plan.ok) {
    return NextResponse.json({ ok: false, error: plan.error }, { status: 400 });
  }
  try {
    const sb = getSupabaseServer();
    const prev = await getPhilifeNeighborhoodSectionSettingsV1Server(sb);
    const value_json: Record<string, unknown> = {
      ...prev,
      show_neighbor_only_filter: plan.write.show_neighbor_only_filter,
    };
    const { error } = await sb.from("admin_settings").upsert(
      {
        key: PHILIFE_NEIGHBORHOOD_SECTION_SETTINGS_KEY,
        value_json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (error) {
      if (error.message?.includes("admin_settings") && error.message?.includes("does not exist")) {
        return NextResponse.json({ ok: false, error: "admin_settings_table_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    clearPhilifeDefaultSectionTopicsCache();
    revalidatePath("/philife", "page");
    return NextResponse.json({
      ok: true,
      show_neighbor_only_filter: plan.write.show_neighbor_only_filter,
      ...(plan.ignoredShowAllFeedTab ? { show_all_feed_tab_ignored: true as const } : {}),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
