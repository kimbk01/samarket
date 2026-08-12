/**
 * L1 Listing write field mapping — posts.seller_listing_state ↔ posts.status.
 * HTTP routes keep their shapes; post column patches go through these helpers
 * so secondary writers cannot update status without listing (or the reverse).
 *
 * STRUCTURAL AUTHORITY LOCK PASS (2026-08-07) — L1 write mapping.
 * docs/trade-community-structural-authority-lock.md
 * Full CANONICAL path (transitions, reserved buyer, broadcast) remains
 * POST /api/posts/[postId]/seller-listing-state.
 */
import type { SellerListingState } from "@/lib/products/seller-listing-state";

export const L1_SELLER_LISTING_STATES: readonly SellerListingState[] = [
  "inquiry",
  "negotiating",
  "reserved",
  "completed",
] as const;

/** seller_listing_state → posts.status (seller-listing-state route SSOT). */
export function postStatusForSellerListingState(state: SellerListingState): "active" | "reserved" | "sold" {
  if (state === "completed") return "sold";
  if (state === "reserved") return "reserved";
  return "active";
}

/** posts.status → seller_listing_state (owner-status mapping). hidden → null (caller sets inquiry). */
export function sellerListingStateForPostStatus(status: string): SellerListingState | null {
  const s = status.trim().toLowerCase();
  if (s === "sold") return "completed";
  if (s === "reserved") return "reserved";
  if (s === "active") return "inquiry";
  return null;
}

export type PostsListingWritePatch = {
  status: string;
  seller_listing_state: SellerListingState;
  updated_at: string;
  reserved_buyer_id?: string | null;
};

/** Patch from L1 listing state (optional reserved buyer). */
export function buildPostsPatchFromSellerListingState(input: {
  sellerListingState: SellerListingState;
  nowIso: string;
  reservedBuyerId?: string | null;
  clearReservedBuyer?: boolean;
}): PostsListingWritePatch {
  const patch: PostsListingWritePatch = {
    status: postStatusForSellerListingState(input.sellerListingState),
    seller_listing_state: input.sellerListingState,
    updated_at: input.nowIso,
  };
  if (input.clearReservedBuyer) {
    patch.reserved_buyer_id = null;
  } else if (input.sellerListingState === "reserved" && input.reservedBuyerId != null) {
    patch.reserved_buyer_id = input.reservedBuyerId;
  } else if (input.sellerListingState !== "reserved") {
    patch.reserved_buyer_id = null;
  }
  return patch;
}

/**
 * Patch from owner-status style post status.
 * CONTRACT: HTTP owner-status only allows active|hidden (reserved/sold need buyer bind).
 * Helper still maps reserved/sold for tests / admin-adjacent callers — those must set
 * reserved_buyer_id / sold_buyer_id themselves when writing.
 */
export function buildPostsPatchFromOwnerStatus(input: {
  postStatus: "active" | "reserved" | "sold" | "hidden";
  nowIso: string;
  reservedBuyerId?: string | null;
}): PostsListingWritePatch {
  if (input.postStatus === "hidden") {
    return {
      status: "hidden",
      seller_listing_state: "inquiry",
      updated_at: input.nowIso,
      reserved_buyer_id: null,
    };
  }
  const listing = sellerListingStateForPostStatus(input.postStatus);
  const patch: PostsListingWritePatch = {
    status: input.postStatus,
    seller_listing_state: listing ?? "inquiry",
    updated_at: input.nowIso,
  };
  if (input.postStatus === "reserved") {
    if (input.reservedBuyerId) {
      patch.reserved_buyer_id = input.reservedBuyerId;
    }
  } else {
    patch.reserved_buyer_id = null;
  }
  return patch;
}
