import type { MessageKey } from "@/lib/i18n/messages";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";

/** 매장 이용 불가 안내 — 안내문(질문 아님). 본문은 상태에 필요한 1문장만. */
export type StoreBusinessBlockedCopy =
  | { titleKey: MessageKey; bodyKey?: MessageKey }
  | { titleKey: MessageKey; bodyText: string };

export function getStoreBusinessBlockedCopy(state: OwnerStoreGateState): StoreBusinessBlockedCopy {
  if (state.kind === "empty") {
    return { titleKey: "popup_store_blocked_empty_title", bodyKey: "popup_store_blocked_empty_body" };
  }
  if (state.kind === "pending") {
    const st = state.approval_status;
    if (st === "rejected") {
      const reason = state.rejected_reason?.trim();
      return reason
        ? { titleKey: "popup_store_blocked_rejected_title", bodyText: reason }
        : { titleKey: "popup_store_blocked_rejected_title" };
    }
    if (st === "revision_requested") {
      const note = state.revision_note?.trim();
      return note
        ? { titleKey: "popup_store_blocked_revision_title", bodyText: note }
        : { titleKey: "popup_store_blocked_revision_title", bodyKey: "popup_store_blocked_revision_body" };
    }
    if (st === "suspended") {
      return { titleKey: "popup_store_blocked_suspended_title", bodyKey: "popup_store_blocked_suspended_body" };
    }
    return { titleKey: "popup_store_blocked_review_title", bodyKey: "popup_store_blocked_review_body" };
  }
  return { titleKey: "popup_store_blocked_approved_only_title" };
}

export function showStoreBusinessProfilePreviewLink(
  state: OwnerStoreGateState,
  firstStoreId: string | undefined
): boolean {
  return !!(
    firstStoreId &&
    state.kind === "pending" &&
    state.approval_status !== "rejected" &&
    state.approval_status !== "suspended"
  );
}

/**
 * R1: apply CTA only when no store row exists.
 * rejected / revision / suspended keep the existing store → Owner Hub, never re-apply.
 */
export function showStoreBusinessApplyLink(state: OwnerStoreGateState): boolean {
  return state.kind === "empty";
}
