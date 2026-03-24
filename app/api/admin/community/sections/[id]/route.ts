import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { normalizeFeedSlug } from "@/lib/community-feed/constants";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const sid = id?.trim();
  if (!sid) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  let body: { name?: string; slug?: string; sort_order?: number; is_active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
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

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  try {
    const sb = getSupabaseServer();
    const { data: before } = await sb.from("community_sections").select("slug").eq("id", sid).maybeSingle();
    const { data, error } = await sb
      .from("community_sections")
      .update(patch)
      .eq("id", sid)
      .select("id, name, slug, sort_order, is_active")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ ok: false, error: "slug_duplicate" }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const oldSlug = (before as { slug?: string } | null)?.slug;
    if (newSlug && oldSlug && newSlug !== oldSlug) {
      await sb.from("community_posts").update({ section_slug: newSlug }).eq("section_id", sid);
    }

    return NextResponse.json({ ok: true, section: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const sid = id?.trim();
  if (!sid) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  try {
    const sb = getSupabaseServer();
    const { count } = await sb
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sid);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { ok: false, error: "section_has_posts", count },
        { status: 409 }
      );
    }
    const { error } = await sb.from("community_sections").delete().eq("id", sid);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
