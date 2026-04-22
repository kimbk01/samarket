import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { normalizeFeedSlug } from "@/lib/community-feed/constants";
import { isMissingDbColumnError } from "@/lib/community-feed/supabase-column-error";
import { isCommunityFeedListSkin, normalizeCommunityFeedListSkin } from "@/lib/community-feed/topic-feed-skin";
import { clearPhilifeDefaultSectionTopicsCache } from "@/lib/neighborhood/philife-neighborhood-topics";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const tid = id?.trim();
  if (!tid) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  let body: {
    section_id?: string;
    name?: string;
    slug?: string;
    sort_order?: number;
    is_active?: boolean;
    is_visible?: boolean;
    is_feed_sort?: boolean;
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

  const patch: Record<string, unknown> = {};
  if (body.section_id != null) {
    const sid = String(body.section_id).trim();
    if (!sid) return NextResponse.json({ ok: false, error: "invalid_section_id" }, { status: 400 });
    patch.section_id = sid;
  }
  if (body.name != null) {
    const n = String(body.name).trim();
    if (!n) return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 });
    patch.name = n;
  }
  let newSlug: string | undefined;
  if (body.slug != null) {
    newSlug = normalizeFeedSlug(body.slug);
    if (!newSlug || newSlug.length < 2) {
      return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });
    }
    patch.slug = newSlug;
  }
  if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.is_visible === "boolean") patch.is_visible = body.is_visible;
  if (typeof body.is_feed_sort === "boolean") patch.is_feed_sort = body.is_feed_sort;
  if (typeof body.allow_question === "boolean") patch.allow_question = body.allow_question;
  if (typeof body.allow_meetup === "boolean") patch.allow_meetup = body.allow_meetup;
  if (body.color !== undefined) {
    patch.color =
      body.color != null && String(body.color).trim() ? String(body.color).trim().slice(0, 32) : null;
  }
  if (body.icon !== undefined) {
    patch.icon =
      body.icon != null && String(body.icon).trim() ? String(body.icon).trim().slice(0, 64) : null;
  }
  if (body.feed_list_skin !== undefined) {
    patch.feed_list_skin = isCommunityFeedListSkin(body.feed_list_skin)
      ? body.feed_list_skin
      : normalizeCommunityFeedListSkin(body.feed_list_skin);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  const selectWithSkin =
    "id, section_id, name, slug, icon, color, sort_order, is_active, is_visible, is_feed_sort, allow_question, allow_meetup, feed_list_skin";
  const selectNoSkin =
    "id, section_id, name, slug, icon, color, sort_order, is_active, is_visible, is_feed_sort, allow_question, allow_meetup";

  try {
    const sb = getSupabaseServer();
    const { data: before } = await sb.from("community_topics").select("slug").eq("id", tid).maybeSingle();
    let { data, error } = await sb
      .from("community_topics")
      .update(patch)
      .eq("id", tid)
      .select(selectWithSkin)
      .maybeSingle();

    if (error && isMissingDbColumnError(error, "feed_list_skin")) {
      const savedSkin =
        patch.feed_list_skin !== undefined
          ? isCommunityFeedListSkin(patch.feed_list_skin)
            ? patch.feed_list_skin
            : normalizeCommunityFeedListSkin(patch.feed_list_skin)
          : undefined;
      const patchNoSkin = { ...patch };
      delete patchNoSkin.feed_list_skin;
      if (Object.keys(patchNoSkin).length === 0) {
        const ref = await sb.from("community_topics").select(selectNoSkin).eq("id", tid).maybeSingle();
        if (ref.error) {
          return NextResponse.json({ ok: false, error: ref.error.message }, { status: 500 });
        }
        if (!ref.data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
        const merged = {
          ...ref.data,
          feed_list_skin: normalizeCommunityFeedListSkin(savedSkin),
        };
        const oldSlug = (before as { slug?: string } | null)?.slug;
        if (newSlug && oldSlug && newSlug !== oldSlug) {
          await sb.from("community_posts").update({ topic_slug: newSlug }).eq("topic_id", tid);
        }
        clearPhilifeDefaultSectionTopicsCache();
        revalidatePath("/philife", "page");
        return NextResponse.json({ ok: true, topic: merged });
      }
      const retry = await sb
        .from("community_topics")
        .update(patchNoSkin)
        .eq("id", tid)
        .select(selectNoSkin)
        .maybeSingle();
      data = retry.data as typeof data;
      error = retry.error;
      if (data && typeof data === "object" && savedSkin !== undefined) {
        data = { ...data, feed_list_skin: savedSkin } as typeof data;
      }
    }

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ ok: false, error: "slug_duplicate_in_section" }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const oldSlug = (before as { slug?: string } | null)?.slug;
    if (newSlug && oldSlug && newSlug !== oldSlug) {
      await sb.from("community_posts").update({ topic_slug: newSlug }).eq("topic_id", tid);
    }

    clearPhilifeDefaultSectionTopicsCache();
    revalidatePath("/philife", "page");
    return NextResponse.json({ ok: true, topic: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const tid = id?.trim();
  if (!tid) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  try {
    const sb = getSupabaseServer();
    const { count } = await sb
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", tid);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ ok: false, error: "topic_has_posts", count }, { status: 409 });
    }
    const { error } = await sb.from("community_topics").delete().eq("id", tid);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    clearPhilifeDefaultSectionTopicsCache();
    revalidatePath("/philife", "page");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
