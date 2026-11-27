import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/posts/[postId]/seller-listing-state
 * Body: { sellerListingState, reservedBuyerId? } — 예약 시 reservedBuyerId 필수(이 글·판매자·해당 구매자 채팅 존재 검증)
 */
import { tradeApiError } from "@/lib/trade/trade-api-error-response";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { normalizeSellerListingState, type SellerListingState } from "@/lib/products/seller-listing-state";
import { canSellerListingTransition } from "@/lib/trade/seller-listing-chat-transitions";
import {
  buildListingSnapshotJson,
  deriveTradeLifecycleStatus,
  flattenPostForTradeCompare,
  mapSellerListingTransitionToLifecycle,
  resolveTradeKindFromCategory,
} from "@/lib/trade/trade-lifecycle-policy";
import { insertPostTradeStatusLog } from "@/lib/trade/post-trade-status-log";
import {
  applySellerListingChangeSideEffectsServer,
  insertSellerListingChangeSystemMessagesServer,
  syncCommunityMessengerTradeStateSummariesServer,
} from "@/lib/trade/insert-seller-listing-change-system-messages";
import type { TradeListingThreadNotice } from "@/lib/trade/trade-listing-thread-notice";
import { publishTradePostListingUpdateFromServer } from "@/lib/trade/trade-post-listing-broadcast-server";
import { postStatusForSellerListingState } from "@/lib/trade/posts-listing-write-fields";
import { recordMessengerMonitoringEvent } from "@/lib/community-messenger/monitoring/server-store-record";

const ALLOWED: SellerListingState[] = ["inquiry", "negotiating", "reserved", "completed"];

async function syncTradeSummaryStateBestEffort(args: {
  sbAny: import("@supabase/supabase-js").SupabaseClient;
  postId: string;
  nextState: SellerListingState;
  postStatus: string;
  postTitle: string | null;
}) {
  const startedAt = Date.now();
  await syncCommunityMessengerTradeStateSummariesServer(args.sbAny, {
    postId: args.postId,
    nextState: args.nextState,
    postStatus: args.postStatus,
    postTitle: args.postTitle,
  }).catch(() => {});
  recordMessengerMonitoringEvent({
    ts: Date.now(),
    category: "db.community_messenger",
    metric: "trade_state_summary_sync",
    source: "server",
    value: Date.now() - startedAt,
    unit: "ms",
    labels: {
      listingState: args.nextState,
      postIdSuffix: args.postId.slice(-8),
    },
  });
}

function isMissingDbColumnMessage(message: string, columnHint: string): boolean {
  return (
    new RegExp(columnHint, "i").test(message) &&
    /does not exist|unknown|schema cache|Could not find|not find the column/i.test(message)
  );
}

/** seller_listing_state 없을 때 status·(가능하면) reserved_buyer_id 만 반영 */
async function updatePostWithoutSellerListingColumn(
  sbAny: import("@supabase/supabase-js").SupabaseClient,
  postId: string,
  postStatus: string,
  now: string,
  nextState: string,
  reservedBuyerRaw: string
): Promise<string | null> {
  const patchMinimal: Record<string, unknown> = {
    status: postStatus,
    updated_at: now,
  };
  if (nextState === "reserved") {
    patchMinimal.reserved_buyer_id = reservedBuyerRaw;
  } else {
    patchMinimal.reserved_buyer_id = null;
  }
  let { error } = await sbAny.from(POSTS_TABLE_WRITE).update(patchMinimal).eq("id", postId);
  if (error && isMissingDbColumnMessage(error.message, "reserved_buyer_id")) {
    const patchNoRb = { ...patchMinimal };
    delete patchNoRb.reserved_buyer_id;
    const r2 = await sbAny.from(POSTS_TABLE_WRITE).update(patchNoRb).eq("id", postId);
    error = r2.error;
  }
  return error ? error.message : null;
}

async function hasSellerBuyerThread(
  sbAny: import("@supabase/supabase-js").SupabaseClient,
  postId: string,
  sellerId: string,
  buyerId: string
): Promise<boolean> {
  const { data: pcs } = await sbAny
    .from("product_chats")
    .select("id")
    .eq("post_id", postId)
    .eq("seller_id", sellerId)
    .eq("buyer_id", buyerId)
    .limit(1);
  if (pcs && pcs.length > 0) return true;
  const { data: crs } = await sbAny
    .from("chat_rooms")
    .select("id")
    .eq("room_type", "item_trade")
    .eq("item_id", postId)
    .eq("seller_id", sellerId)
    .eq("buyer_id", buyerId)
    .limit(1);
  return !!(crs && crs.length > 0);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return tradeApiError("service_unavailable", 500);
  }

  const { postId } = await params;
  let body: { sellerListingState?: string; reservedBuyerId?: string | null };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const nextState = typeof body.sellerListingState === "string" ? body.sellerListingState.trim().toLowerCase() : "";
  const reservedBuyerRaw =
    body.reservedBuyerId === null || body.reservedBuyerId === undefined
      ? ""
      : String(body.reservedBuyerId).trim();
  if (!postId?.trim() || !ALLOWED.includes(nextState as SellerListingState)) {
    return tradeApiError("invalid_request", 400);
  }

  const sbAny = sb;
  const access = await assertVerifiedMemberForAction(sbAny as any, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }
  const { data: post, error: postErr } = await sbAny
    .from(POSTS_TABLE_READ)
    .select(
      "id, user_id, status, seller_listing_state, meta, title, content, price, region, city, images, thumbnail_url, trade_category_id, is_free_share, is_price_offer"
    )
    .eq("id", postId.trim())
    .maybeSingle();

  if (postErr) {
    console.error("[seller-listing-state] post lookup failed", postErr);
    return tradeApiError("post_lookup_failed", 500);
  }
  if (!post) {
    return tradeApiError("product_not_found", 404);
  }
  const row = post as { user_id?: string; status?: string };
  const ownerId = row.user_id ?? "";
  if (!ownerId || ownerId !== userId) {
    return tradeApiError("seller_only", 403);
  }

  const prevListing = normalizeSellerListingState(
    (post as { seller_listing_state?: unknown }).seller_listing_state,
    (post as { status?: string }).status
  );
  const nextListing = nextState as SellerListingState;
  /** 거래 B (Owner 2026-10-28): 예약·구매자 지정 없음 — 예약 쓰기 거절 */
  if (nextListing === "reserved") {
    return tradeApiError("reserved_not_supported", 400);
  }
  /** 거래완료는 구매자를 지정하는 seller-complete 로만 (구매자 없는 sold 방지 — TM-17, owner-status 와 같은 규칙) */
  if (nextListing === "completed") {
    return tradeApiError("completed_requires_seller_complete", 400);
  }
  if (!canSellerListingTransition(prevListing, nextListing)) {
    return tradeApiError("listing_transition_not_allowed", 400);
  }

  if (nextState === "reserved") {
    if (!reservedBuyerRaw) {
      return tradeApiError("reserved_buyer_required", 400);
    }
    const okThread = await hasSellerBuyerThread(sbAny, postId.trim(), userId, reservedBuyerRaw);
    if (!okThread) {
      return tradeApiError("reserved_buyer_no_chat", 400);
    }
  }

  const now = new Date().toISOString();
  const postStatus = postStatusForSellerListingState(nextListing);

  const prevRow = post as Record<string, unknown>;
  const prevSeller = String(prevRow.seller_listing_state ?? "inquiry").trim().toLowerCase();
  const prevLifecycle = deriveTradeLifecycleStatus({
    status: prevRow.status as string,
    seller_listing_state: prevRow.seller_listing_state as string | undefined,
    meta: prevRow.meta as Record<string, unknown> | null,
  });
  const nextLifecycle = mapSellerListingTransitionToLifecycle(nextState as SellerListingState);

  const baseMeta =
    prevRow.meta && typeof prevRow.meta === "object" && prevRow.meta !== null
      ? ({ ...(prevRow.meta as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  baseMeta.trade_lifecycle_status = nextLifecycle;

  const snapCandidate =
    (prevSeller === "inquiry" || !prevRow.seller_listing_state) &&
    (nextState === "negotiating" || nextState === "reserved");
  if (snapCandidate) {
    const catId = String(prevRow.trade_category_id ?? "").trim();
    let slug = "market";
    let iconKey = "";
    if (catId) {
      const { data: cat } = await sbAny.from("categories").select("slug, icon_key").eq("id", catId).maybeSingle();
      if (cat) {
        slug = String((cat as { slug?: string }).slug ?? "market");
        iconKey = String((cat as { icon_key?: string }).icon_key ?? "");
      }
    }
    const kind = resolveTradeKindFromCategory({ slug, icon_key: iconKey });
    const flat = flattenPostForTradeCompare(prevRow);
    baseMeta.listing_snapshot_json = buildListingSnapshotJson(flat, kind);
  }

  const patch: Record<string, unknown> = {
    seller_listing_state: nextState,
    status: postStatus,
    updated_at: now,
    meta: baseMeta,
  };

  if (nextState === "reserved") {
    patch.reserved_buyer_id = reservedBuyerRaw;
  } else {
    patch.reserved_buyer_id = null;
  }

  const { error: updErr } = await sbAny.from(POSTS_TABLE_WRITE).update(patch).eq("id", postId.trim());

  if (updErr) {
    let msg = updErr.message ?? "";

    const missingReserved = isMissingDbColumnMessage(msg, "reserved_buyer_id");
    if (missingReserved) {
      const patchNoRb = { ...patch };
      delete patchNoRb.reserved_buyer_id;
      const { error: e2 } = await sbAny.from(POSTS_TABLE_WRITE).update(patchNoRb).eq("id", postId.trim());
      if (!e2) {
        try {
          await sbAny
            .from("chat_rooms")
            .update({ trade_status: nextState, updated_at: now })
            .eq("room_type", "item_trade")
            .eq("item_id", postId.trim());
        } catch {
          /* ignore */
        }
        let threadNotices: TradeListingThreadNotice[] = [];
        try {
          threadNotices = await insertSellerListingChangeSystemMessagesServer(sbAny, {
            postId: postId.trim(),
            sellerUserId: userId,
            nextState: nextState as SellerListingState,
          });
        } catch {
          threadNotices = [];
        }
        await publishTradePostListingUpdateFromServer({
          postId: postId.trim(),
          sellerListingState: nextState,
          postStatus,
          threadNotices,
        });
        await syncTradeSummaryStateBestEffort({
          sbAny,
          postId: postId.trim(),
          nextState: nextState as SellerListingState,
          postStatus,
          postTitle: typeof prevRow.title === "string" ? prevRow.title : null,
        });
        return NextResponse.json({
          ok: true,
          sellerListingState: nextState,
          status: postStatus,
          reservedBuyerId: nextState === "reserved" ? reservedBuyerRaw : null,
          threadNotices,
          /** 경고 코드 — 화면 문구는 `tradeListingWarningText` */
          warning: "reserved_buyer_column_missing",
        });
      }
      msg = e2.message ?? msg;
    }

    const missingListing = isMissingDbColumnMessage(msg, "seller_listing_state");
    if (missingListing) {
      const fbErr = await updatePostWithoutSellerListingColumn(
        sbAny,
        postId.trim(),
        postStatus,
        now,
        nextState,
        reservedBuyerRaw
      );
      if (fbErr === null) {
        try {
          await sbAny
            .from("chat_rooms")
            .update({ trade_status: nextState, updated_at: now })
            .eq("room_type", "item_trade")
            .eq("item_id", postId.trim());
        } catch {
          /* ignore */
        }
        let threadNoticesFb: TradeListingThreadNotice[] = [];
        try {
          threadNoticesFb = await insertSellerListingChangeSystemMessagesServer(sbAny, {
            postId: postId.trim(),
            sellerUserId: userId,
            nextState: nextState as SellerListingState,
          });
        } catch {
          threadNoticesFb = [];
        }
        await publishTradePostListingUpdateFromServer({
          postId: postId.trim(),
          sellerListingState: nextState,
          postStatus,
          threadNotices: threadNoticesFb,
        });
        await syncTradeSummaryStateBestEffort({
          sbAny,
          postId: postId.trim(),
          nextState: nextState as SellerListingState,
          postStatus,
          postTitle: typeof prevRow.title === "string" ? prevRow.title : null,
        });
        return NextResponse.json({
          ok: true,
          sellerListingState: nextState,
          status: postStatus,
          reservedBuyerId: nextState === "reserved" ? reservedBuyerRaw : null,
          threadNotices: threadNoticesFb,
          /** 경고 코드 — 화면 문구는 `tradeListingWarningText` */
          warning: "seller_listing_column_missing",
        });
      }
      msg = fbErr;
    }

    console.error("[seller-listing-state] update failed", msg);
    return missingListing
      ? tradeApiError("seller_listing_schema_missing", 503)
      : tradeApiError("seller_listing_save_failed", 500);
  }

  await insertPostTradeStatusLog(sbAny, {
    postId: postId.trim(),
    fromStatus: prevLifecycle,
    toStatus: nextLifecycle,
    userId,
    snapshot:
      typeof baseMeta.listing_snapshot_json === "object" && baseMeta.listing_snapshot_json !== null
        ? (baseMeta.listing_snapshot_json as Record<string, unknown>)
        : { seller_listing_state: nextState },
  });

  try {
    await sbAny
      .from("chat_rooms")
      .update({ trade_status: nextState, updated_at: now })
      .eq("room_type", "item_trade")
      .eq("item_id", postId.trim());
  } catch {
    /* chat_rooms 없거나 컬럼 불일치 시 무시 */
  }

  const threadNoticesMain: TradeListingThreadNotice[] = await applySellerListingChangeSideEffectsServer(sbAny, {
    postId: postId.trim(),
    sellerUserId: userId,
    nextState: nextState as SellerListingState,
    postStatus,
    postTitle: typeof prevRow.title === "string" ? prevRow.title : null,
    syncSummaries: (input) => syncTradeSummaryStateBestEffort({ sbAny, ...input }),
  });

  return NextResponse.json({
    ok: true,
    sellerListingState: nextState,
    status: postStatus,
    reservedBuyerId: nextState === "reserved" ? reservedBuyerRaw : null,
    threadNotices: threadNoticesMain,
  });
}
