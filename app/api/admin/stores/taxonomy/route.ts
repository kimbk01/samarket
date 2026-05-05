import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  BROWSE_PRIMARY_INDUSTRIES,
  BROWSE_SUB_INDUSTRIES,
} from "@/lib/stores/browse-mock/mock-store-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoreCategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
};

type StoreTopicRow = {
  id: string;
  store_category_id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
};

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const [{ data: categories, error: cErr }, { data: topics, error: tErr }] = await Promise.all([
    sb
      .from("store_categories")
      .select("id, name, slug, sort_order, is_active")
      .order("sort_order", { ascending: true }),
    sb
      .from("store_topics")
      .select("id, store_category_id, name, slug, sort_order, is_active")
      .order("sort_order", { ascending: true }),
  ]);

  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    categories: (categories ?? []) as StoreCategoryRow[],
    topics: (topics ?? []) as StoreTopicRow[],
  });
}

export async function PATCH(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as
    | { kind?: "category" | "topic"; id?: string; patch?: Record<string, unknown> }
    | null;
  const kind = body?.kind;
  const id = (body?.id ?? "").trim();
  const patch = body?.patch ?? null;
  if (!kind || !id || !patch || typeof patch !== "object") {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const allowKeys =
    kind === "category"
      ? new Set(["name", "sort_order", "is_active"])
      : new Set(["name", "sort_order", "is_active", "store_category_id"]);
  const safePatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!allowKeys.has(k)) continue;
    safePatch[k] = v;
  }
  if (Object.keys(safePatch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  const table = kind === "category" ? "store_categories" : "store_topics";
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

  // POST는 두 가지 모드:
  // 1) body 없이 호출: 기본 업종/주제 시드
  // 2) body로 { kind: "category" | "topic", ... } 보내면 단건 생성(업서트)

  let body: any = null;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  const kind = typeof body?.kind === "string" ? body.kind : null;

  // ---- Mode 2: create single ----
  if (kind === "category") {
    const name = String(body?.name ?? "").trim();
    const slug = String(body?.slug ?? "").trim().toLowerCase();
    const sort_order = Number(body?.sort_order ?? 0) || 0;
    if (!name || !slug) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const { data, error } = await sb
      .from("store_categories")
      .upsert({ name, slug, sort_order, is_active: true }, { onConflict: "slug" })
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, row: data });
  }

  if (kind === "topic") {
    const store_category_id = String(body?.store_category_id ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const slug = String(body?.slug ?? "").trim().toLowerCase();
    const sort_order = Number(body?.sort_order ?? 0) || 0;
    if (!store_category_id || !name || !slug) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    const { data, error } = await sb
      .from("store_topics")
      .upsert(
        { store_category_id, name, slug, sort_order, is_active: true },
        { onConflict: "slug" }
      )
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, row: data });
  }

  // ---- Mode 1: seed defaults ----
  // 1) categories upsert (slug 기준)
  const categoriesPayload = BROWSE_PRIMARY_INDUSTRIES.map((c) => ({
    name: c.nameKo,
    slug: c.slug,
    sort_order: c.sortOrder,
    is_active: true,
  }));

  const { error: upCatErr } = await sb.from("store_categories").upsert(categoriesPayload, { onConflict: "slug" });

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
    const slug = String((r as any).slug ?? "").trim();
    const id = String((r as any).id ?? "").trim();
    if (slug && id) catIdBySlug.set(slug, id);
  }

  // 2) topics upsert (slug 기준) — category id 매핑 필요
  const topicsPayload = BROWSE_SUB_INDUSTRIES.map((t) => ({
    store_category_id: catIdBySlug.get(t.primarySlug) ?? null,
    name: t.nameKo,
    slug: t.slug,
    sort_order: t.sortOrder,
    is_active: true,
  })).filter((t) => !!t.store_category_id);

  const { error: upTopicErr } = await sb.from("store_topics").upsert(topicsPayload as any[], { onConflict: "slug" });

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

