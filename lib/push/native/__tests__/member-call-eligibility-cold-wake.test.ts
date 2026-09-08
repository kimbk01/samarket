import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (_method?: string, _payload?: Record<string, unknown>) => ({ ok: true }));

vi.mock("@/lib/call/native/native-call-service", () => ({
  invokeNativeCallServicePlugin: (method: string, payload?: Record<string, unknown>) =>
    invoke(method, payload),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => true,
}));

describe("projectNativeMemberEventEligibility CUT7 cold-wake contract", () => {
  beforeEach(() => {
    invoke.mockClear();
  });

  it("I1 refuses eligible=true without boundUserId without CLEAR", async () => {
    const { projectNativeMemberEventEligibility } = await import(
      "@/lib/push/native/member-call-eligibility-bridge"
    );
    await projectNativeMemberEventEligibility({
      eligible: true,
      boundUserId: "",
      reason: "session_authenticated:test",
    });
    // Wave-1 M1: skip native mutation — empty-uid must not CLEAR presentable.
    expect(invoke).not.toHaveBeenCalled();
  });

  it("I1b projects eligible=true with bound user", async () => {
    const { projectNativeMemberEventEligibility } = await import(
      "@/lib/push/native/member-call-eligibility-bridge"
    );
    await projectNativeMemberEventEligibility({
      eligible: true,
      boundUserId: "5a22455c-9efc-4b93-8caf-31c6faaaf5ad",
      reason: "session_authenticated:test",
    });
    expect(invoke).toHaveBeenCalledWith(
      "setMemberCallEligible",
      expect.objectContaining({
        eligible: true,
        boundUserId: "5a22455c-9efc-4b93-8caf-31c6faaaf5ad",
      }),
    );
  });

  it("I5 logout clears eligibility", async () => {
    const { projectNativeMemberEventEligibility } = await import(
      "@/lib/push/native/member-call-eligibility-bridge"
    );
    await projectNativeMemberEventEligibility({
      eligible: false,
      boundUserId: null,
      reason: "logout_local_fail_closed",
    });
    expect(invoke).toHaveBeenCalledWith(
      "setMemberCallEligible",
      expect.objectContaining({
        eligible: false,
        boundUserId: "",
      }),
    );
  });
});
