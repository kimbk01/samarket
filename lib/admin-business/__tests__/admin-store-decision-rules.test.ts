import { describe, expect, it } from "vitest";
import {
  ADMIN_STORE_ACTION_TARGET_STATUS,
  ADMIN_STORE_ACTIONS_REQUIRING_REASON,
  allowedStoreApprovalActions,
  isAdminStoreApprovalAction,
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

describe("ACC-04 — reopen rejected application (재심사 열기)", () => {
  it("allows only rejected → revision_requested", () => {
    expect(isAdminStoreTransitionAllowed("reopen_application", "rejected")).toBe(true);
    for (const s of ["pending", "under_review", "revision_requested", "approved", "suspended", "", null]) {
      expect(isAdminStoreTransitionAllowed("reopen_application", s)).toBe(false);
    }
    expect(ADMIN_STORE_ACTION_TARGET_STATUS.reopen_application).toBe("revision_requested");
  });

  it("every other transition out of rejected stays blocked", () => {
    expect(allowedStoreApprovalActions("rejected")).toEqual(["reopen_application"]);
    for (const a of [
      "start_review",
      "mark_under_review",
      "approve_store",
      "reject_store",
      "request_revision",
      "suspend_store",
      "resume_store",
    ] as const) {
      expect(isAdminStoreTransitionAllowed(a, "rejected")).toBe(false);
    }
  });

  it("requires a reason and is a known approval action", () => {
    expect(ADMIN_STORE_ACTIONS_REQUIRING_REASON.has("reopen_application")).toBe(true);
    expect(isAdminStoreApprovalAction("reopen_application")).toBe(true);
    expect(isAdminStoreApprovalAction("confirm_core_info_reverified")).toBe(false);
  });

  it("reopened application follows the existing resubmit path (revision_requested → pending on content edit)", () => {
    expect(
      ownerEditReturnsStoreToPending(ADMIN_STORE_ACTION_TARGET_STATUS.reopen_application, ["address_line1"])
    ).toBe(true);
  });
});
