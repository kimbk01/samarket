import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAppleNativeAuthEmail, isApplePrivateRelayEmail } from "@/lib/auth/native/apple-auth-env.server";
import { buildAppleSupabasePassword } from "@/lib/auth/native/apple-native-session.server";

describe("apple-native-session.server helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds deterministic auth email from sub without using relay email", () => {
    const email = buildAppleNativeAuthEmail("001234.abc");
    expect(email).toContain("@apple.native.dibay.internal");
    expect(email).not.toContain("privaterelay");
  });

  it("builds stable password from sub", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
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

  it("OA-13: fails closed without seed env (no hard-coded fallback)", () => {
    vi.stubEnv("APPLE_NATIVE_PASSWORD_SEED", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => buildAppleSupabasePassword("sub-1")).toThrow("native_password_seed_missing");
  });
});
