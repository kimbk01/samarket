import { describe, expect, it } from "vitest";
import {
  ADMIN_STORE_ACTIONS_REQUIRING_REASON,
  allowedStoreApprovalActions,
  isAdminStoreTransitionAllowed,
  ownerEditReturnsStoreToPending,
} from "@/lib/admin-business/admin-store-decision-rules";

describe("admin store decision rules", () => {
  it("DEF-11 — blocks rejected → approved / resume", () => {
    expect(isAdminStoreTransitionAllowed("approve_store", "rejected")).toBe(false);
    expect(isAdminStoreTransitionAllowed("resume_store", "rejected")).toBe(false);
    expect(isAdminStoreTransitionAllowed("resume_store", "suspended")).toBe(true);
    expect(allowedStoreApprovalActions("approved")).toEqual(["suspend_store"]);
  });

  it("DEF-20 — reject / revision / suspend need a reason", () => {
    for (const a of ["reject_store", "request_revision", "suspend_store", "suspend_sales"]) {
      expect(ADMIN_STORE_ACTIONS_REQUIRING_REASON.has(a)).toBe(true);
    }
    expect(ADMIN_STORE_ACTIONS_REQUIRING_REASON.has("approve_store")).toBe(false);
  });

  it("C-6 / DEF-16 — owner content edit on revision_requested returns to pending", () => {
    expect(ownerEditReturnsStoreToPending("revision_requested", ["description"])).toBe(true);
    expect(ownerEditReturnsStoreToPending("revision_requested", ["lat", "lng"])).toBe(true);
    // 영업 스위치·메신저 설정만 저장 = 재제출 아님
    expect(ownerEditReturnsStoreToPending("revision_requested", ["is_open", "messenger_voice_calls_enabled"])).toBe(
      false
    );
    expect(ownerEditReturnsStoreToPending("approved", ["description"])).toBe(false);
    expect(ownerEditReturnsStoreToPending("pending", ["description"])).toBe(false);
  });
});
