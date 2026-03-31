import { normalizeSellerListingState } from "@/lib/products/seller-listing-state";

export type PostListOwnerMenuInput = {
  author_id?: string | null;
  status?: string | null;
  seller_listing_state?: string | null;
};

export function isTradePostForOwnerMenu(postType: string | null | undefined): boolean {
  const t = (postType ?? "trade").toLowerCase();
  return t === "trade" || t === "service" || t === "feature";
}

export function isPostListOwnedByViewer(
  post: PostListOwnerMenuInput,
  viewerId: string | null | undefined
): boolean {
  const uid = viewerId?.trim() ?? "";
  const aid = (post.author_id ?? "").trim();
  return Boolean(uid && aid && uid === aid);
}

/** 예약중·거래완료·판매/숨김 등 — 피드 ⋮에서 본인 수정·삭제 불가 */
export function ownerCannotEditDeleteReason(post: PostListOwnerMenuInput): string | null {
  const st = String(post.status ?? "active").toLowerCase();
  if (["sold", "reserved", "hidden", "deleted", "blinded"].includes(st)) {
    return "이 글은 지금 수정하거나 삭제할 수 없어요.";
  }
  const ls = normalizeSellerListingState(post.seller_listing_state, st);
  if (ls === "reserved") return "예약 중인 글은 수정·삭제할 수 없어요.";
  if (ls === "completed") return "거래가 완료된 글은 수정·삭제할 수 없어요.";
  return null;
}

export function canOwnerEditDeleteTradePostFromFeed(post: PostListOwnerMenuInput): boolean {
  return ownerCannotEditDeleteReason(post) === null;
}
