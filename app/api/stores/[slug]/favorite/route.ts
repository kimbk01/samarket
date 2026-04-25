import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveStoreId(supabase: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>, slug: string) {
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) return null;
  const { data, error } = await supabase
    .from("stores")
    .select("id, approval_status, is_visible")
    .eq("slug", decoded)
    .maybeSingle();
  if (error || !data || data.approval_status !== "approved" || !data.is_visible) return null;
  return data.id as string;
}

/** 매장 찜 추가 */
export async function POST(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const access = await assertVerifiedMemberForAction(supabase as any, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }
  const { slug } = await context.params;
  const storeId = await resolveStoreId(supabase, slug);
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }
  const { error: insErr } = await supabase.from("store_favorites").insert({
    user_id: userId,
    store_id: storeId,
  });
  if (insErr && insErr.code !== "23505") {
    console.error("[POST store favorite]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }
  const { count } = await supabase
    .from("store_favorites")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);
  return NextResponse.json({
    ok: true,
    favorited: true,
    favorite_count: typeof count === "number" ? count : 0,
  });
}

/** 매장 찜 해제 */
export async function DELETE(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;
  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const access = await assertVerifiedMemberForAction(supabase as any, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }
  const { slug } = await context.params;
  const storeId = await resolveStoreId(supabase, slug);
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }
  const { error } = await supabase.from("store_favorites").delete().eq("user_id", userId).eq("store_id", storeId);
  if (error) {
    console.error("[DELETE store favorite]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const { count } = await supabase
    .from("store_favorites")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);
  return NextResponse.json({
    ok: true,
    favorited: false,
    favorite_count: typeof count === "number" ? count : 0,
  });
}
