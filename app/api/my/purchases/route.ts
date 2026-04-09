/**
 * 구매내역 — 내가 구매자인 거래 (product_chats.buyer_id + chat_rooms에서 내가 buyer인 글)
 * GET /api/my/purchases (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createClient } from "@supabase/supabase-js";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { fetchFirstThumbnailByPostIds } from "@/lib/mypage/fetch-first-post-thumbnails";
import { applyBuyerAutoConfirmAllDue } from "@/lib/trade/apply-buyer-auto-confirm";
import { loadPurchaseHistoryRows } from "@/lib/mypage/trade-history-load-server";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const countOnly = req.nextUrl.searchParams.get("count_only") === "1";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "");
  const previewLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 20) : null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  await applyBuyerAutoConfirmAllDue(sbAny);

  let rows: Record<string, unknown>[];
  try {
    const loaded = await loadPurchaseHistoryRows(sbAny, userId);
    rows = loaded.rows;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "load failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (countOnly) {
    return NextResponse.json({ ok: true, count: rows.length });
  }

  if (rows.length === 0) {
    return NextResponse.json({ items: [] });
  }

  if (previewLimit != null && rows.length > previewLimit) {
    rows = rows.slice(0, previewLimit);
  }

  const roomIds = rows.map((r) => String(r.id));
  const postIds = [...new Set(rows.map((r) => String(r.post_id)).filter(Boolean))];
  const [revRows, posts] = await Promise.all([
    sbAny
      .from("transaction_reviews")
      .select("room_id")
      .eq("reviewer_id", userId)
      .eq("role_type", "buyer_to_seller")
      .in("room_id", roomIds)
      .then(
        ({ data }: { data: { room_id: string }[] | null }) => data ?? []
      ),
    sbAny
      .from("posts")
      .select("*")
      .in("id", postIds)
      .then(
        ({ data }: { data: Record<string, unknown>[] | null }) => data ?? []
      ),
  ]);

  const reviewedRooms = new Set(revRows.map((x) => x.room_id).filter(Boolean));

  const postMap = new Map(
    posts.map((p: Record<string, unknown>) => [String(p.id), p])
  );
  const missingPostIds = postIds.filter((id) => id && !postMap.has(String(id)));
  for (const mid of missingPostIds.slice(0, 20)) {
    const { data: one } = await sbAny.from("posts").select("*").eq("id", mid).maybeSingle();
    if (one) postMap.set(String(mid), one as Record<string, unknown>);
  }

  const firstImageFromPostImages = await fetchFirstThumbnailByPostIds(sbAny, postIds);

  const listingOwnerIds = new Set<string>();
  for (const r of rows) {
    const post = postMap.get(String(r.post_id)) as Record<string, unknown> | undefined;
    const oid = postAuthorUserId(post);
    if (oid) listingOwnerIds.add(oid);
  }

  const nickById = new Map<string, string>();
  const owners = [...listingOwnerIds];
  if (owners.length) {
    const { data: profiles } = await sbAny
      .from("profiles")
      .select("id, nickname, username")
      .in("id", owners);
    (profiles ?? []).forEach((p: Record<string, unknown>) => {
      const id = p.id as string;
      nickById.set(id, ((p.nickname ?? p.username) as string) || "");
    });
  }
  const needTest = owners.filter((id) => !nickById.get(id)?.trim());
  if (needTest.length) {
    const { data: tus } = await sbAny
      .from("test_users")
      .select("id, display_name, username")
      .in("id", needTest);
    (tus ?? []).forEach((t: Record<string, unknown>) => {
      const id = t.id as string;
      const n = (t.display_name ?? t.username) as string;
      if (id && n) nickById.set(id, n);
    });
  }

  const items = rows.map((r: Record<string, unknown>) => {
    const postId = String(r.post_id ?? "");
    const post = postMap.get(postId) as Record<string, unknown> | undefined;
    const summary = chatProductSummaryFromPostRow(post, postId);
    const rid = r.id as string;
    const thumb =
      summary.thumbnail.trim() || firstImageFromPostImages.get(postId) || "";
    const listingOwnerId = postAuthorUserId(post) ?? String(r.seller_id ?? "");
    return {
      chatId: rid,
      postId,
      sellerId: listingOwnerId,
      sellerNickname:
        nickById.get(listingOwnerId)?.trim() || listingOwnerId.slice(0, 8),
      title: summary.title,
      price: summary.price,
      status: summary.status,
      sellerListingState: summary.sellerListingState,
      thumbnail: thumb,
      createdAt: (r.created_at as string) ?? null,
      lastMessageAt: (r.last_message_at as string) ?? null,
      lastMessagePreview: (r.last_message_preview as string) ?? "",
      postUpdatedAt: summary.updatedAt ?? null,
      tradeFlowStatus: (r.trade_flow_status as string) ?? "chatting",
      chatMode: (r.chat_mode as string) ?? "open",
      soldBuyerId: (post?.sold_buyer_id as string) ?? null,
      sellerCompletedAt: (r.seller_completed_at as string) ?? null,
      buyerConfirmedAt: (r.buyer_confirmed_at as string) ?? null,
      reviewDeadlineAt: (r.review_deadline_at as string) ?? null,
      buyerConfirmSource: (r.buyer_confirm_source as string) ?? null,
      hasBuyerReview: reviewedRooms.has(rid),
    };
  });

  return NextResponse.json({ items });
}
