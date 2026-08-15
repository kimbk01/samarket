import { describe, expect, it } from "vitest";
import { resolveManagedMyCtaActive } from "@/lib/my/resolve-managed-my-cta-active";

describe("resolveManagedMyCtaActive", () => {
  it("marks account home active on /mypage/trust (IA: profile manner → trust)", () => {
    expect(resolveManagedMyCtaActive("/mypage/trust", "/mypage")).toBe(true);
    expect(resolveManagedMyCtaActive("/mypage/trust", "/mypage/account")).toBe(false);
    expect(resolveManagedMyCtaActive("/mypage/trust", "/mypage/points")).toBe(false);
  });

  it("keeps prefix active for points descendants", () => {
    expect(resolveManagedMyCtaActive("/mypage/points/charge", "/mypage/points")).toBe(true);
    expect(resolveManagedMyCtaActive("/mypage/points", "/mypage/points")).toBe(true);
  });

  it("does not activate hub home for unrelated account paths", () => {
    expect(resolveManagedMyCtaActive("/mypage/account", "/mypage")).toBe(false);
  });
});
