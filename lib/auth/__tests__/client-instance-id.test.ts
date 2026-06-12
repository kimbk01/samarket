import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIBAY_AUTH_BOUND_USER_ID_KEY,
  DIBAY_CLIENT_INSTANCE_ID_KEY,
  bindAuthUserId,
  detectAuthUserMismatch,
  ensureClientInstanceId,
} from "@/lib/auth/client-instance-id";

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("client-instance-id", () => {
  let local: Storage;

  beforeEach(() => {
    local = createStorage();
    vi.stubGlobal("window", { localStorage: local });
    vi.stubGlobal("localStorage", local);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ensureClientInstanceId persists across calls", () => {
    const a = ensureClientInstanceId();
    const b = ensureClientInstanceId();
    expect(a).toBe(b);
    expect(local.getItem(DIBAY_CLIENT_INSTANCE_ID_KEY)).toBe(a);
  });

  it("detectAuthUserMismatch when bound user differs", () => {
    bindAuthUserId("user-a");
    expect(detectAuthUserMismatch("user-a")).toBe(false);
    expect(detectAuthUserMismatch("user-b")).toBe(true);
    expect(local.getItem(DIBAY_AUTH_BOUND_USER_ID_KEY)).toBe("user-a");
  });
});
