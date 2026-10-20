import { describe, expect, it } from "vitest";
import {
  canConfirmAdminAction,
  isAdminTypedConfirmMatch,
} from "@/lib/admin/operator-ux/admin-typed-confirm";

describe("admin typed confirm (V3-06 / V3-07)", () => {
  it("matches ignoring spaces, thousand separators and case", () => {
    expect(isAdminTypedConfirmMatch("1,200", "1200")).toBe(true);
    expect(isAdminTypedConfirmMatch(" 철수 500 ", "철수 500")).toBe(true);
    expect(isAdminTypedConfirmMatch("abc 5", "ABC 5")).toBe(true);
    expect(isAdminTypedConfirmMatch("1201", "1200")).toBe(false);
    expect(isAdminTypedConfirmMatch("철수 50", "철수 500")).toBe(false);
  });

  it("never passes with an empty expected value", () => {
    expect(isAdminTypedConfirmMatch("", "")).toBe(false);
  });

  it("keeps old behavior when confirmMatchText is not given", () => {
    expect(canConfirmAdminAction({ reasonRequired: false, reason: "", typed: "" })).toBe(true);
    expect(canConfirmAdminAction({ reasonRequired: true, reason: " ", typed: "" })).toBe(false);
    expect(canConfirmAdminAction({ reasonRequired: true, reason: "x", typed: "" })).toBe(true);
  });

  it("requires both the reason min length and the typed match", () => {
    const base = { reasonRequired: true, reasonMinLength: 2, confirmMatchText: "300" };
    expect(canConfirmAdminAction({ ...base, reason: "x", typed: "300" })).toBe(false);
    expect(canConfirmAdminAction({ ...base, reason: "사유", typed: "30" })).toBe(false);
    expect(canConfirmAdminAction({ ...base, reason: "사유", typed: "300" })).toBe(true);
  });
});
