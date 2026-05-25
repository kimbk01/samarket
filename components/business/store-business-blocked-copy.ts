import type { MessageKey } from "@/lib/i18n/messages";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";

export type StoreBusinessBlockedCopy =
  | { titleKey: MessageKey; bodyKey: MessageKey }
  | { titleKey: MessageKey; bodyText: string };

export function getStoreBusinessBlockedCopy(state: OwnerStoreGateState): StoreBusinessBlockedCopy {
  if (state.kind === "empty") {
    return { titleKey: "business_phase7_620", bodyKey: "business_phase7_621" };
  }
  if (state.kind === "pending") {
    const st = state.approval_status;
    if (st === "rejected") {
      const reason = state.rejected_reason?.trim();
      return reason
        ? { titleKey: "business_phase7_622", bodyText: reason }
        : { titleKey: "business_phase7_622", bodyKey: "business_phase7_623" };
    }
    if (st === "revision_requested") {
      const note = state.revision_note?.trim();
      return note
        ? { titleKey: "business_phase7_624", bodyText: note }
        : { titleKey: "business_phase7_624", bodyKey: "business_phase7_625" };
    }
    return { titleKey: "business_phase7_626", bodyKey: "business_phase7_627" };
  }
  return { titleKey: "business_phase7_628", bodyKey: "business_phase7_629" };
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

export function showStoreBusinessApplyLink(state: OwnerStoreGateState): boolean {
  return (
    state.kind === "empty" ||
    (state.kind === "pending" && state.approval_status === "rejected")
  );
}
