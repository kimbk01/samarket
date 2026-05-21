import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 주문 채팅 목록 — `contextMeta.thumbnailUrl` 이 비어 있을 때 `storeId` 로 매장 프로필 URL 확정.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:store-profile-thumb:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "썸네일 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_store_profile_thumb_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const storeId = req.nextUrl.searchParams.get("storeId")?.trim() ?? "";
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "storeId_required" }, { status: 400 });
  }

  const { getSupabaseServer } = await import("@/lib/chat/supabase-server");
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: store, error } = await sb
    .from("stores")
    .select("id, owner_user_id, profile_image_url")
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!store) {
    return NextResponse.json({ ok: true, url: null });
  }

  const ownerId = String(store.owner_user_id ?? "").trim();
  if (ownerId !== auth.userId) {
    const { count, error: orderErr } = await sb
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .eq("buyer_user_id", auth.userId);
    if (orderErr) {
      return NextResponse.json({ ok: false, error: orderErr.message }, { status: 500 });
    }
    if (!count || count < 1) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  const raw = store.profile_image_url;
  const url = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  return NextResponse.json({ ok: true, url });
}
