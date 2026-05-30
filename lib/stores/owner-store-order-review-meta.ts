import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapBuyerStoreOrderReviewRow,
  type BuyerStoreOrderReviewSummary,
} from "@/lib/stores/buyer-store-order-review-meta";

export type StoreReviewItemFeedback = Record<string, "up" | "down">;

export type OwnerStoreOrderReviewDetail = BuyerStoreOrderReviewSummary & {
  image_urls: string[];
  item_feedback: StoreReviewItemFeedback | null;
  created_at: string;
  status: string;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseItemFeedback(raw: unknown): StoreReviewItemFeedback | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: StoreReviewItemFeedback = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = key.trim();
    if (!id) continue;
    if (value === "up" || value === "down") out[id] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function parseImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
}

export function mapOwnerStoreOrderReviewRow(
  row: Record<string, unknown> | null | undefined
): OwnerStoreOrderReviewDetail | null {
  const base = mapBuyerStoreOrderReviewRow(row);
  if (!base) return null;
  return {
    ...base,
    image_urls: parseImageUrls(row?.image_urls),
    item_feedback: parseItemFeedback(row?.item_feedback),
    created_at: trimText(row?.created_at),
    status: trimText(row?.status) || "visible",
  };
}

const OWNER_SELECT =
  "id, rating, content, visible_to_public, image_urls, item_feedback, status, created_at, owner_reply_content, owner_reply_created_at";

function isMissingColumnError(err: { message?: string } | null, column: string): boolean {
  const msg = String(err?.message ?? "");
  return new RegExp(column, "i").test(msg) && /does not exist/i.test(msg);
}

/** 매장 오너 — 주문 1건에 연결된 리뷰(별점·본문·메뉴 평가·사진·사장님 댓글). */
export async function loadOwnerStoreOrderReviewForOrder(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<{
  review: OwnerStoreOrderReviewDetail | null;
  revErr: { message?: string } | null;
}> {
  const oid = orderId.trim();
  if (!oid) return { review: null, revErr: null };

  let sel = await sb.from("store_reviews").select(OWNER_SELECT).eq("order_id", oid).maybeSingle();
  if (!sel.error && sel.data) {
    return { review: mapOwnerStoreOrderReviewRow(sel.data as Record<string, unknown>), revErr: null };
  }

  if (sel.error && isMissingColumnError(sel.error, "item_feedback")) {
    sel = await sb
      .from("store_reviews")
      .select(
        "id, rating, content, visible_to_public, image_urls, status, created_at, owner_reply_content, owner_reply_created_at"
      )
      .eq("order_id", oid)
      .maybeSingle();
    if (!sel.error && sel.data) {
      return {
        review: mapOwnerStoreOrderReviewRow({ ...(sel.data as object), item_feedback: null }),
        revErr: null,
      };
    }
  }

  if (sel.error && isMissingColumnError(sel.error, "owner_reply")) {
    sel = await sb
      .from("store_reviews")
      .select("id, rating, content, visible_to_public, image_urls, item_feedback, status, created_at")
      .eq("order_id", oid)
      .maybeSingle();
    if (!sel.error && sel.data) {
      const base = mapOwnerStoreOrderReviewRow({
        ...(sel.data as object),
        owner_reply_content: null,
        owner_reply_created_at: null,
      });
      return { review: base, revErr: null };
    }
  }

  if (sel.error && isMissingColumnError(sel.error, "visible_to_public")) {
    const fb = await sb
      .from("store_reviews")
      .select(
        "id, rating, content, image_urls, item_feedback, status, created_at, owner_reply_content, owner_reply_created_at"
      )
      .eq("order_id", oid)
      .maybeSingle();
    if (!fb.error && fb.data) {
      return {
        review: mapOwnerStoreOrderReviewRow({ ...(fb.data as object), visible_to_public: true }),
        revErr: null,
      };
    }
    if (fb.error) return { review: null, revErr: fb.error };
  }

  const revErr = sel.error;
  return { review: mapOwnerStoreOrderReviewRow(sel.data as Record<string, unknown> | null), revErr };
}
