import { describe, expect, it } from "vitest";
import { getOwnerStoreGateState, hasApprovedOwnerStore } from "@/lib/stores/store-admin-access";

describe("getOwnerStoreGateState — approval_status folding", () => {
  it("empty stores → kind empty", () => {
    expect(getOwnerStoreGateState([])).toEqual({ kind: "empty" });
  });

  it("approved → kind approved (any row)", () => {
    expect(
      getOwnerStoreGateState([
        { id: "a", approval_status: "pending" },
        { id: "b", approval_status: "approved" },
      ]),
    ).toEqual({ kind: "approved" });
    expect(hasApprovedOwnerStore([{ approval_status: "approved" }])).toBe(true);
  });

  it.each([
    "pending",
    "under_review",
    "revision_requested",
    "rejected",
    "suspended",
  ] as const)("%s folds into kind pending with same approval_status", (status) => {
    const gate = getOwnerStoreGateState([
      {
        id: "s1",
        approval_status: status,
        rejected_reason: status === "rejected" ? "사유" : null,
        revision_note: status === "revision_requested" ? "보완" : null,
      },
    ]);
    expect(gate.kind).toBe("pending");
    if (gate.kind === "pending") {
      expect(gate.approval_status).toBe(status);
    }
  });
});
