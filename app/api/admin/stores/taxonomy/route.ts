import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { loadStoreTaxonomyRows } from "@/lib/stores/load-store-taxonomy-rows";
import {
  BROWSE_PRIMARY_INDUSTRIES,
  BROWSE_SUB_INDUSTRIES,
} from "@/lib/stores/browse-mock/mock-store-categories";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATCH_KINDS = new Set(["category", "topic", "subtopic"]);

function sanitizeNameEn(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t.slice(0, 120) : null;
}

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  try {
    const loaded = await loadStoreTaxonomyRows(sb, { activeOnly: false });
    return NextResponse.json({
      ok: true,
      categories: loaded.categories,
      topics: loaded.topics,
      subtopics: loaded.subtopics,
      meta: {
        subtopics_table: loaded.subtopicsTableMissing ? ("missing" as const) : ("ok" as const),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as
    | { kind?: string; id?: string; patch?: Record<string, unknown> }
    | null;
  const kind = body?.kind;
  const id = (body?.id ?? "").trim();
  const patch = body?.patch ?? null;
  if (!kind || !id || !patch || typeof patch !== "object") {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!PATCH_KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const allowKeys =
    kind === "category"
      ? new Set(["name", "name_en", "sort_order", "is_active", "image_url"])
      : kind === "topic"
        ? new Set(["name", "name_en", "sort_order", "is_active", "store_category_id", "image_url"])
        : new Set(["name", "name_en", "sort_order", "is_active", "store_topic_id", "image_url"]);
  const safePatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!allowKeys.has(k)) continue;
    if (k === "name_en") {
      safePatch[k] = sanitizeNameEn(v);
      continue;
    }
    safePatch[k] = v;
  }
  if (Object.keys(safePatch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  const table =
    kind === "category" ? "store_categories" : kind === "topic" ? "store_topics" : "store_subtopics";
  const { data, error } = await sb.from(table).update(safePatch).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, row: data });
}

export async function POST(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  let body: Record<string, unknown> | null = null;
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }

  if (body?.seed === true) {
    return seedDefaultTaxonomy(sb);
  }

  const kind = typeof body?.kind === "string" ? body.kind : null;

  if (kind === "category") {
    const name = String(body?.name ?? "").trim();
    const name_en = sanitizeNameEn(body?.name_en);
    const slug = String(body?.slug ?? "").trim().toLowerCase();
    const sort_order = Number(body?.sort_order ?? 0) || 0;
    if (!name || !slug) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const { data, error } = await sb
      .from("store_categories")
      .upsert({ name, name_en, slug, sort_order, is_active: true }, { onConflict: "slug" })
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, row: data });
  }

  if (kind === "topic") {
    const store_category_id = String(body?.store_category_id ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const name_en = sanitizeNameEn(body?.name_en);
    const slug = String(body?.slug ?? "").trim().toLowerCase();
    const sort_order = Number(body?.sort_order ?? 0) || 0;
    if (!store_category_id || !name || !slug) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const { data, error } = await sb
      .from("store_topics")
      .upsert(
        { store_category_id, name, name_en, slug, sort_order, is_active: true },
        { onConflict: "slug" }
      )
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, row: data });
  }

  if (kind === "subtopic") {
    const store_topic_id = String(body?.store_topic_id ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const name_en = sanitizeNameEn(body?.name_en);
    const slug = String(body?.slug ?? "").trim().toLowerCase();
    const sort_order = Number(body?.sort_order ?? 0) || 0;
    if (!store_topic_id || !name || !slug) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const { data, error } = await sb
      .from("store_subtopics")
      .upsert({ store_topic_id, name, name_en, slug, sort_order, is_active: true }, { onConflict: "slug" })
      .select()
      .maybeSingle();
    if (error) {
      const msg = error.message ?? "";
      if (/store_subtopics|does not exist|relation/i.test(msg)) {
        return NextResponse.json(
          { ok: false, error: "store_subtopics_table_missing", message: msg },
          { status: 503 }
        );
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, row: data });
  }

  return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
}

async function seedDefaultTaxonomy(sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>) {
  const categoriesPayload = BROWSE_PRIMARY_INDUSTRIES.map((c) => ({
    name: c.nameKo,
    slug: c.slug,
    sort_order: c.sortOrder,
    is_active: true,
  }));

  const { error: upCatErr } = await sb.from("store_categories").upsert(categoriesPayload, {
    onConflict: "slug",
    ignoreDuplicates: true,
  });
  if (upCatErr) {
    return NextResponse.json({ ok: false, error: upCatErr.message }, { status: 500 });
  }

  const { data: catRows, error: catLoadErr } = await sb
    .from("store_categories")
    .select("id, slug")
    .in("slug", BROWSE_PRIMARY_INDUSTRIES.map((c) => c.slug));
  if (catLoadErr) {
    return NextResponse.json({ ok: false, error: catLoadErr.message }, { status: 500 });
  }

  const catIdBySlug = new Map<string, string>();
  for (const r of catRows ?? []) {
    const slug = String((r as { slug?: string }).slug ?? "").trim();
    const id = String((r as { id?: string }).id ?? "").trim();
    if (slug && id) catIdBySlug.set(slug, id);
  }

  const topicsPayload = BROWSE_SUB_INDUSTRIES.map((t) => ({
    store_category_id: catIdBySlug.get(t.primarySlug) ?? null,
    name: t.nameKo,
    slug: t.slug,
    sort_order: t.sortOrder,
    is_active: true,
  })).filter((t) => !!t.store_category_id);

  const { error: upTopicErr } = await sb.from("store_topics").upsert(topicsPayload, {
    onConflict: "slug",
    ignoreDuplicates: true,
  });
  if (upTopicErr) {
    return NextResponse.json({ ok: false, error: upTopicErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    seeded: {
      categories: categoriesPayload.length,
      topics: topicsPayload.length,
    },
  });
}
