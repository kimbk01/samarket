import {
  allowAnyPostUpdate,
  allowSoftDelete,
  deriveTradeLifecycleStatus,
  tradeLifecycleHint,
} from "@/lib/trade/trade-lifecycle-policy";

export type PostListOwnerMenuInput = {
  author_id?: string | null;
  status?: string | null;
  seller_listing_state?: string | null;
  meta?: Record<string, unknown> | null;
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

function lifecycleFromPost(post: PostListOwnerMenuInput) {
  return deriveTradeLifecycleStatus({
    status: String(post.status ?? "active").toLowerCase(),
    seller_listing_state: post.seller_listing_state,
    meta: post.meta ?? null,
  });
}

/** 수정 메뉴 비활성 (완료·숨김 등) */
export function ownerEditLockedFromPost(post: PostListOwnerMenuInput): boolean {
  return !allowAnyPostUpdate(lifecycleFromPost(post));
}

/** 삭제 메뉴 비활성 (판매중·초안만 삭제 가능) */
export function ownerDeleteLockedFromPost(post: PostListOwnerMenuInput): boolean {
  return !allowSoftDelete(lifecycleFromPost(post));
}

export function ownerEditLockHint(post: PostListOwnerMenuInput): string {
  if (!ownerEditLockedFromPost(post)) return "";
  return tradeLifecycleHint(lifecycleFromPost(post)) ?? "이 글은 지금 수정할 수 없어요.";
}

export function ownerDeleteLockHint(post: PostListOwnerMenuInput): string {
  if (!ownerDeleteLockedFromPost(post)) return "";
  return "협의·거래 진행 중에는 삭제할 수 없어요. 숨김 처리를 이용해 주세요.";
}

/** @deprecated 피드에서 수정·삭제 잠금을 동시에 쓸 때 — 둘 중 하나라도 잠기면 메시지 */
export function ownerCannotEditDeleteReason(post: PostListOwnerMenuInput): string | null {
  const e = ownerEditLockedFromPost(post);
  const d = ownerDeleteLockedFromPost(post);
  if (e && d) return `${ownerEditLockHint(post)} ${ownerDeleteLockHint(post)}`.trim();
  if (e) return ownerEditLockHint(post);
  if (d) return ownerDeleteLockHint(post);
  return null;
}

export function canOwnerEditDeleteTradePostFromFeed(post: PostListOwnerMenuInput): boolean {
  return !ownerEditLockedFromPost(post) && !ownerDeleteLockedFromPost(post);
}
