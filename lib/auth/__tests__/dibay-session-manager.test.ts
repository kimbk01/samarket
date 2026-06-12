import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isTerminalAuthCode,
  dibayUserStorageKey,
  listUserScopedStorageKeysForUser,
} from "@/lib/auth/dibay-session-policy";

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => null,
}));

describe("dibay-session-policy", () => {
  it("recognizes terminal auth codes", () => {
    expect(isTerminalAuthCode("refresh_token_not_found")).toBe(true);
    expect(isTerminalAuthCode("network_error")).toBe(false);
  });

  it("builds user scoped storage keys", () => {
    expect(dibayUserStorageKey("user-1", "cart")).toBe("dibay:user-1:cart");
  });
});

describe("dibay-session-manager", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
  });

  it("returns guest when supabase client missing", async () => {
    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
    const result = await mod.ensureSessionHealthy("test");
    expect(result.ok).toBe(false);
    expect(result.phase).toBe("guest");
    expect(mod.getSessionPhase()).toBe("guest");
  });
});

describe("listUserScopedStorageKeysForUser", () => {
  it("lists keys with user prefix", () => {
    const storage = {
      length: 3,
      key: (i: number) => ["dibay:u1:cart", "dibay:client_instance_id", "other"][i] ?? null,
    } as Storage;
    expect(listUserScopedStorageKeysForUser("u1", storage)).toEqual(["dibay:u1:cart"]);
  });
});
