import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { listAllCommunityTopicsForAdmin } from "@/lib/community-topics/server";
import { normalizeFeedSlug } from "@/lib/community-feed/constants";
import { parseCommunityTopicFeedSortMode } from "@/lib/community-feed/feed-sort-mode";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";
import { isCommunityFeedListSkin, normalizeCommunityFeedListSkin } from "@/lib/community-feed/topic-feed-skin";
import { clearPhilifeDefaultSectionTopicsCache } from "@/lib/neighborhood/philife-neighborhood-topics";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const topics = await listAllCommunityTopicsForAdmin();
  return NextResponse.json({ ok: true, topics });
}

export async function POST(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: {
    section_id?: string;
    name?: string;
    slug?: string;
    sort_order?: number;
    is_active?: boolean;
    is_visible?: boolean;
    is_feed_sort?: boolean;
    feed_sort_mode?: string | null;
    allow_question?: boolean;
    allow_meetup?: boolean;
    color?: string | null;
    icon?: string | null;
    feed_list_skin?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const section_id = String(body.section_id ?? "").trim();
  const name = String(body.name ?? "").trim();
  const slug = normalizeFeedSlug(body.slug || body.name || "");
  if (!section_id) return NextResponse.json({ ok: false, error: "section_id_required" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  if (!slug || slug.length < 2) return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });

  const sort_order = typeof body.sort_order === "number" ? body.sort_order : 0;
  const is_active = body.is_active !== false;
  const is_visible = body.is_visible !== false;
  const is_feed_sort = !!body.is_feed_sort;
  const feedSortParsed = parseCommunityTopicFeedSortMode(body.feed_sort_mode);
  const feed_sort_mode: "popular" | "recommended" | null =
    is_feed_sort
      ? feedSortParsed === "recommended" || feedSortParsed === "popular"
        ? feedSortParsed
        : "popular"
      : null;
  const allow_question = body.allow_question !== false;
  const allow_meetup = !!body.allow_meetup;
  const color = body.color != null && String(body.color).trim() ? String(body.color).trim().slice(0, 32) : null;
  const icon = body.icon != null && String(body.icon).trim() ? String(body.icon).trim().slice(0, 64) : null;
  const feed_list_skin = isCommunityFeedListSkin(body.feed_list_skin)
    ? body.feed_list_skin
    : normalizeCommunityFeedListSkin(body.feed_list_skin);

  const selectWithSkin =
    "id, section_id, name, slug, icon, color, sort_order, is_active, is_visible, is_feed_sort, feed_sort_mode, allow_question, allow_meetup, feed_list_skin";
  const selectNoSkin =
    "id, section_id, name, slug, icon, color, sort_order, is_active, is_visible, is_feed_sort, feed_sort_mode, allow_question, allow_meetup";
  const baseRow = {
    section_id,
    name,
    slug,
    sort_order,
    is_active,
    is_visible,
    is_feed_sort,
    feed_sort_mode: is_feed_sort ? feed_sort_mode : null,
    allow_question,
    allow_meetup,
    color,
    icon,
  };

  try {
    const sb = getSupabaseServer();
    let { data, error } = await sb
      .from("community_topics")
      .insert({ ...baseRow, feed_list_skin })
      .select(selectWithSkin)
      .single();
    if (error && isMissingDbColumnError(error, "feed_sort_mode")) {
      const sub = { ...baseRow, feed_list_skin } as Record<string, unknown>;
      delete sub.feed_sort_mode;
      const r0 = await sb
        .from("community_topics")
        .insert(sub)
        .select(
          "id, section_id, name, slug, icon, color, sort_order, is_active, is_visible, is_feed_sort, allow_question, allow_meetup, feed_list_skin"
        )
        .single();
      data = r0.data as typeof data;
      error = r0.error;
      if (data && typeof data === "object" && "feed_sort_mode" in baseRow) {
        data = { ...data, feed_sort_mode: baseRow.feed_sort_mode } as typeof data;
      }
    }
    if (error && isMissingDbColumnError(error, "feed_list_skin")) {
      const retry = await sb.from("community_topics").insert(baseRow).select(selectNoSkin).single();
      data = retry.data as typeof data;
      error = retry.error;
      if (data && typeof data === "object") {
        data = { ...data, feed_list_skin, feed_sort_mode: baseRow.feed_sort_mode } as typeof data;
      }
    }
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ ok: false, error: "slug_duplicate_in_section" }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    clearPhilifeDefaultSectionTopicsCache();
    revalidatePath("/philife", "page");
    return NextResponse.json({ ok: true, topic: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
