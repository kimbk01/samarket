import { describe, expect, it } from "vitest";
import {
  ADMIN_STORE_ACTION_TARGET_STATUS,
  ADMIN_STORE_ACTIONS_REQUIRING_REASON,
  allowedStoreApprovalActions,
  isAdminStoreApprovalAction,
  isAdminStoreTransitionAllowed,
  OWNER_RESUBMIT_FROM_STATUS,
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

  it("매장 신청 v2 — 재제출은 보완 요청 상태에서 「보완 내용 제출」로만", () => {
    expect(OWNER_RESUBMIT_FROM_STATUS).toBe("revision_requested");
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

  it("reopened application lands on the resubmit status (보완 내용 제출 가능)", () => {
    expect(ADMIN_STORE_ACTION_TARGET_STATUS.reopen_application).toBe(OWNER_RESUBMIT_FROM_STATUS);
  });
});
