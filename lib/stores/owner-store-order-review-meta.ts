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

/** 클라이언트 GET 응답 review 필드 — shape 깨져도 크래시·빈 UI 방지 */
export function normalizeOwnerStoreOrderReviewDetail(raw: unknown): OwnerStoreOrderReviewDetail | null {
  if (!raw || typeof raw !== "object") return null;
  return mapOwnerStoreOrderReviewRow(raw as Record<string, unknown>);
}

const OWNER_FULL_SELECT =
  "id, rating, content, visible_to_public, image_urls, item_feedback, status, created_at, owner_reply_content, owner_reply_created_at";

function isMissingColumnError(err: { message?: string } | null, column: string): boolean {
  const msg = String(err?.message ?? "");
  return new RegExp(column, "i").test(msg) && /does not exist/i.test(msg);
}

function withOwnerReviewDefaults(row: Record<string, unknown>): Record<string, unknown> {
  return {
    visible_to_public: true,
    image_urls: [],
    item_feedback: null,
    status: "visible",
    created_at: "",
    owner_reply_content: null,
    owner_reply_created_at: null,
    ...row,
  };
}

async function selectOwnerReviewRow(
  sb: SupabaseClient<any>,
  orderId: string,
  select: string
): Promise<{ row: Record<string, unknown> | null; error: { message?: string } | null }> {
  const res = await sb.from("store_reviews").select(select).eq("order_id", orderId).maybeSingle();
  if (!res.error) {
    return { row: (res.data as Record<string, unknown> | null) ?? null, error: null };
  }

  const msg = String(res.error.message ?? "");
  if (/multiple/i.test(msg) || /0 rows/i.test(msg) || /PGRST116/i.test(msg)) {
    const limited = await sb.from("store_reviews").select(select).eq("order_id", orderId).limit(1);
    if (limited.error) return { row: null, error: limited.error };
    const first = Array.isArray(limited.data) ? limited.data[0] : limited.data;
    return { row: (first as unknown as Record<string, unknown> | null) ?? null, error: null };
  }

  return { row: null, error: res.error };
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

  let sel = await selectOwnerReviewRow(sb, oid, OWNER_FULL_SELECT);
  if (!sel.error && sel.row) {
    return { review: mapOwnerStoreOrderReviewRow(withOwnerReviewDefaults(sel.row)), revErr: null };
  }

  if (sel.error?.message?.includes("store_reviews") && sel.error.message.includes("does not exist")) {
    return { review: null, revErr: sel.error };
  }

  if (sel.error && isMissingColumnError(sel.error, "owner_reply")) {
    sel = await selectOwnerReviewRow(
      sb,
      oid,
      "id, rating, content, visible_to_public, image_urls, item_feedback, status, created_at"
    );
    if (!sel.error && sel.row) {
      return {
        review: mapOwnerStoreOrderReviewRow(
          withOwnerReviewDefaults({
            ...sel.row,
            owner_reply_content: null,
            owner_reply_created_at: null,
          })
        ),
        revErr: null,
      };
    }
  }

  if (sel.error && isMissingColumnError(sel.error, "item_feedback")) {
    sel = await selectOwnerReviewRow(
      sb,
      oid,
      "id, rating, content, visible_to_public, image_urls, status, created_at, owner_reply_content, owner_reply_created_at"
    );
    if (!sel.error && sel.row) {
      return {
        review: mapOwnerStoreOrderReviewRow(withOwnerReviewDefaults({ ...sel.row, item_feedback: null })),
        revErr: null,
      };
    }
  }

  if (sel.error && isMissingColumnError(sel.error, "image_urls")) {
    sel = await selectOwnerReviewRow(
      sb,
      oid,
      "id, rating, content, visible_to_public, item_feedback, status, created_at, owner_reply_content, owner_reply_created_at"
    );
    if (!sel.error && sel.row) {
      return {
        review: mapOwnerStoreOrderReviewRow(withOwnerReviewDefaults({ ...sel.row, image_urls: [] })),
        revErr: null,
      };
    }
  }

  if (sel.error && isMissingColumnError(sel.error, "visible_to_public")) {
    sel = await selectOwnerReviewRow(
      sb,
      oid,
      "id, rating, content, image_urls, item_feedback, status, created_at, owner_reply_content, owner_reply_created_at"
    );
    if (!sel.error && sel.row) {
      return {
        review: mapOwnerStoreOrderReviewRow(withOwnerReviewDefaults({ ...sel.row, visible_to_public: true })),
        revErr: null,
      };
    }
  }

  if (sel.error && isMissingColumnError(sel.error, "rating")) {
    sel = await selectOwnerReviewRow(sb, oid, "id");
    if (!sel.error && sel.row?.id) {
      return {
        review: mapOwnerStoreOrderReviewRow(
          withOwnerReviewDefaults({
            ...sel.row,
            rating: 5,
            content: "",
          })
        ),
        revErr: null,
      };
    }
  }

  if (sel.error && isMissingColumnError(sel.error, "created_at")) {
    sel = await selectOwnerReviewRow(
      sb,
      oid,
      "id, rating, content, visible_to_public, image_urls, item_feedback, status, owner_reply_content, owner_reply_created_at"
    );
    if (!sel.error && sel.row) {
      return {
        review: mapOwnerStoreOrderReviewRow(withOwnerReviewDefaults({ ...sel.row, created_at: "" })),
        revErr: null,
      };
    }
  }

  if (sel.error && isMissingColumnError(sel.error, "status")) {
    sel = await selectOwnerReviewRow(
      sb,
      oid,
      "id, rating, content, visible_to_public, image_urls, item_feedback, created_at, owner_reply_content, owner_reply_created_at"
    );
    if (!sel.error && sel.row) {
      return {
        review: mapOwnerStoreOrderReviewRow(withOwnerReviewDefaults({ ...sel.row, status: "visible" })),
        revErr: null,
      };
    }
  }

  return {
    review: mapOwnerStoreOrderReviewRow(sel.row ? withOwnerReviewDefaults(sel.row) : null),
    revErr: sel.error,
  };
}
