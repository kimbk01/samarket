import {
  allowAnyPostUpdate,
  allowSoftDelete,
  deriveTradeLifecycleStatus,
  tradeLifecycleHintKey,
} from "@/lib/trade/trade-lifecycle-policy";
import type { MessageKey } from "@/lib/i18n/messages";

/** 판매완료 글 삭제 잠금 — 서버 거절(`owner-delete`) 전용 한국어 문구. 화면은 번역 키 `ui_post_owner_delete_locked_completed` (B-12) */
export const OWNER_DELETE_LOCKED_COMPLETED_KO = "거래가 끝난 글은 거래 기록으로 남아 수정·삭제할 수 없어요.";

export type PostListOwnerMenuInput = {
  author_id?: string | null;
  status?: string | null;
  seller_listing_state?: string | null;
  meta?: Record<string, unknown> | null;
  /** `posts.moderation_state` — 관리자 숨김·삭제면 판매자 메뉴는 「문의하기」만 (D-1) */
  moderation_state?: string | null;
};

/** 관리자 숨김·삭제 글 — 판매자는 수정·삭제·다시 판매중을 할 수 없다(설계 v2 §F-1-1) */
export function isAdminModeratedTradePost(post: PostListOwnerMenuInput): boolean {
  const m = String(post.moderation_state ?? "").trim();
  return m === "admin_hidden" || m === "admin_deleted";
}

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
  return isAdminModeratedTradePost(post) || !allowAnyPostUpdate(lifecycleFromPost(post));
}

/** 삭제 메뉴 비활성 (판매중·초안만 삭제 가능) */
export function ownerDeleteLockedFromPost(post: PostListOwnerMenuInput): boolean {
  return isAdminModeratedTradePost(post) || !allowSoftDelete(lifecycleFromPost(post));
}

export function ownerEditLockHintKey(post: PostListOwnerMenuInput): MessageKey | null {
  if (!ownerEditLockedFromPost(post)) return null;
  if (isAdminModeratedTradePost(post)) return "ui_post_owner_locked_admin";
  const lifecycle = lifecycleFromPost(post);
  if (lifecycle === "hidden") return "ui_post_owner_locked_hidden";
  return tradeLifecycleHintKey(lifecycle) ?? "ui_post_owner_edit_locked_default";
}

export function ownerDeleteLockHintKey(post: PostListOwnerMenuInput): MessageKey | null {
  if (!ownerDeleteLockedFromPost(post)) return null;
  if (isAdminModeratedTradePost(post)) return "ui_post_owner_locked_admin";
  const lifecycle = lifecycleFromPost(post);
  /** 판매완료 = 숨김도 없음 — 「숨김 처리를 이용」 안내 금지 (실기 2026-11-03 F1) */
  if (lifecycle === "completed") return "ui_post_owner_delete_locked_completed";
  if (lifecycle === "hidden") return "ui_post_owner_locked_hidden";
  return "ui_post_owner_delete_locked_hint";
}

const OWNER_LOCK_KEYS = new Set<MessageKey>([
  "ui_post_owner_delete_locked_completed",
  "ui_post_owner_delete_locked_hint",
  "ui_post_owner_locked_hidden",
  "ui_post_owner_locked_admin",
  "ui_post_owner_edit_locked_default",
]);

/** 재감사 B-12: 서버 거절 응답의 `lockKey` → 화면 번역 키(모르는 값이면 null → 기존 `error` 문구) */
export function ownerLockKeyFromResponse(value: unknown): MessageKey | null {
  return typeof value === "string" && OWNER_LOCK_KEYS.has(value as MessageKey) ? (value as MessageKey) : null;
}
