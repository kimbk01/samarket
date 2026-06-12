import { dbStoreToBusinessProfile, type StoreRow } from "@/lib/stores/db-store-mapper";
import type { BusinessProfile } from "@/lib/types/business";

export function mapAdminStoreRowToBusinessProfile(
  row: StoreRow & Record<string, unknown>,
  ownerNickname = ""
): BusinessProfile {
  const profile = dbStoreToBusinessProfile(row);
  profile.ownerNickname = ownerNickname || profile.ownerNickname;
  const internalMemo = row.admin_internal_memo;
  if (typeof internalMemo === "string" && internalMemo.trim()) {
    profile.adminMemo = internalMemo.trim();
  }
  return profile;
}

export function businessStatusToStoreAction(status: BusinessProfile["status"]): string {
  switch (status) {
    case "active":
      return "approve_store";
    case "rejected":
      return "reject_store";
    case "paused":
      return "suspend_store";
    default:
      return "start_review";
  }
}

export function storeApprovalToBusinessAction(
  currentStatus: BusinessProfile["status"],
  target: BusinessProfile["status"]
): string | null {
  if (currentStatus === "pending" && target === "active") return "approve_store";
  if (currentStatus === "pending" && target === "rejected") return "reject_store";
  if (currentStatus === "active" && target === "paused") return "suspend_store";
  if (currentStatus === "paused" && target === "active") return "resume_store";
  return null;
}
