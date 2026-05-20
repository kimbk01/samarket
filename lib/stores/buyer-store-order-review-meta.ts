import type { SupabaseClient } from "@supabase/supabase-js";

export type BuyerStoreOrderReviewSummary = {
  id: string;
  rating: number;
  content: string;
  visible_to_public: boolean;
  owner_reply_content: string | null;
  owner_reply_created_at: string | null;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampRating(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(5, Math.max(1, n));
}

function rowToSummary(row: Record<string, unknown> | null | undefined): BuyerStoreOrderReviewSummary | null {
  if (!row?.id) return null;
  const id = trimText(row.id);
  if (!id) return null;
  return {
    id,
    rating: clampRating(row.rating),
    content: trimText(row.content),
    visible_to_public: row.visible_to_public !== false,
    owner_reply_content: trimText(row.owner_reply_content) || null,
    owner_reply_created_at: trimText(row.owner_reply_created_at) || null,
  };
}

const FULL_SELECT =
  "id, rating, content, visible_to_public, owner_reply_content, owner_reply_created_at";

function isMissingColumnError(err: { message?: string } | null, column: string): boolean {
  const msg = String(err?.message ?? "");
  return new RegExp(column, "i").test(msg) && /does not exist/i.test(msg);
}

/** 구매자 주문 상세 — 단건 리뷰(별점·본문·사장님 댓글). */
export async function loadBuyerStoreOrderReviewForOrder(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<{
  review: BuyerStoreOrderReviewSummary | null;
  revErr: { message?: string } | null;
}> {
  const oid = orderId.trim();
  if (!oid) return { review: null, revErr: null };

  let sel = await sb.from("store_reviews").select(FULL_SELECT).eq("order_id", oid).maybeSingle();
  if (!sel.error && sel.data) {
    return { review: rowToSummary(sel.data as Record<string, unknown>), revErr: null };
  }

  if (sel.error && isMissingColumnError(sel.error, "owner_reply")) {
    sel = await sb
      .from("store_reviews")
      .select("id, rating, content, visible_to_public")
      .eq("order_id", oid)
      .maybeSingle();
    if (!sel.error && sel.data) {
      const base = rowToSummary(sel.data as Record<string, unknown>);
      return {
        review: base
          ? { ...base, owner_reply_content: null, owner_reply_created_at: null }
          : null,
        revErr: null,
      };
    }
  }

  if (sel.error && isMissingColumnError(sel.error, "visible_to_public")) {
    const fb = await sb
      .from("store_reviews")
      .select("id, rating, content, owner_reply_content, owner_reply_created_at")
      .eq("order_id", oid)
      .maybeSingle();
    if (!fb.error && fb.data) {
      const base = rowToSummary({ ...(fb.data as object), visible_to_public: true });
      return { review: base, revErr: null };
    }
    if (fb.error) return { review: null, revErr: fb.error };
  }

  if (sel.error && isMissingColumnError(sel.error, "rating")) {
    const fb = await sb.from("store_reviews").select("id").eq("order_id", oid).maybeSingle();
    if (!fb.error && fb.data?.id) {
      return {
        review: {
          id: trimText((fb.data as { id?: unknown }).id),
          rating: 5,
          content: "",
          visible_to_public: true,
          owner_reply_content: null,
          owner_reply_created_at: null,
        },
        revErr: fb.error,
      };
    }
    return { review: null, revErr: fb.error };
  }

  const revErr = sel.error;
  return { review: rowToSummary(sel.data as Record<string, unknown> | null), revErr };
}

/** 구매자 주문 목록 — order_id 별 리뷰 요약 일괄 조회. */
export async function loadBuyerStoreOrderReviewsByOrderIds(
  sb: SupabaseClient<any>,
  orderIds: string[]
): Promise<{
  byOrderId: Map<string, BuyerStoreOrderReviewSummary>;
  reviewsUnavailable: boolean;
}> {
  const ids = orderIds.map((id) => id.trim()).filter(Boolean);
  const byOrderId = new Map<string, BuyerStoreOrderReviewSummary>();
  if (!ids.length) return { byOrderId, reviewsUnavailable: false };

  const res = await sb.from("store_reviews").select(`order_id, ${FULL_SELECT}`).in("order_id", ids);

  if (res.error && isMissingColumnError(res.error, "owner_reply")) {
    const slim = await sb
      .from("store_reviews")
      .select("order_id, id, rating, content, visible_to_public")
      .in("order_id", ids);
    if (!slim.error && slim.data) {
      for (const row of slim.data as Array<Record<string, unknown>>) {
        const oid = trimText(row.order_id);
        const summary = rowToSummary(row);
        if (oid && summary) {
          byOrderId.set(oid, { ...summary, owner_reply_content: null, owner_reply_created_at: null });
        }
      }
      return { byOrderId, reviewsUnavailable: false };
    }
  }

  if (res.error?.message?.includes("store_reviews") && res.error.message.includes("does not exist")) {
    return { byOrderId, reviewsUnavailable: true };
  }

  if (res.error && isMissingColumnError(res.error, "rating")) {
    const fb = await sb.from("store_reviews").select("order_id, id").in("order_id", ids);
    if (!fb.error && fb.data) {
      for (const row of fb.data as Array<{ order_id?: unknown; id?: unknown }>) {
        const oid = trimText(row.order_id);
        const id = trimText(row.id);
        if (oid && id) {
          byOrderId.set(oid, {
            id,
            rating: 5,
            content: "",
            visible_to_public: true,
            owner_reply_content: null,
            owner_reply_created_at: null,
          });
        }
      }
      return { byOrderId, reviewsUnavailable: false };
    }
    return { byOrderId, reviewsUnavailable: !!fb.error };
  }

  if (!res.error && res.data) {
    for (const row of res.data as Array<Record<string, unknown>>) {
      const oid = trimText(row.order_id);
      const summary = rowToSummary(row);
      if (oid && summary) byOrderId.set(oid, summary);
    }
  }

  return { byOrderId, reviewsUnavailable: false };
}
