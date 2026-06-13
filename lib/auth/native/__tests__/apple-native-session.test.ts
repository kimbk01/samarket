import { describe, expect, it } from "vitest";
import { buildAppleNativeAuthEmail, isApplePrivateRelayEmail } from "@/lib/auth/native/apple-auth-env.server";
import { buildAppleSupabasePassword } from "@/lib/auth/native/apple-native-session.server";

describe("apple-native-session.server helpers", () => {
  it("builds deterministic auth email from sub without using relay email", () => {
    const email = buildAppleNativeAuthEmail("001234.abc");
    expect(email).toContain("@apple.native.dibay.internal");
    expect(email).not.toContain("privaterelay");
  });

  it("builds stable password from sub", () => {
    const a = buildAppleSupabasePassword("sub-1");
    const b = buildAppleSupabasePassword("sub-1");
    const c = buildAppleSupabasePassword("sub-2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("detects Apple private relay email", () => {
    expect(isApplePrivateRelayEmail("x@privaterelay.appleid.com")).toBe(true);
    expect(isApplePrivateRelayEmail("user@gmail.com")).toBe(false);
  });
});
