import { describe, expect, it } from "vitest";
import {
  invalidateAdminQueryCache,
  isAdminQueryFresh,
  peekAdminQueryData,
  setAdminQueryData,
} from "@/lib/admin/admin-query-cache";

describe("admin-query-cache", () => {
  it("stores and peeks data within ttl", () => {
    setAdminQueryData("admin:test", { n: 1 }, 30_000, 1_000);
    expect(peekAdminQueryData<{ n: number }>("admin:test")).toEqual({ n: 1 });
    expect(isAdminQueryFresh("admin:test", 20_000)).toBe(true);
    expect(isAdminQueryFresh("admin:test", 40_000)).toBe(false);
  });

  it("invalidates by prefix", () => {
    setAdminQueryData("admin:orders:a", 1, 30_000);
    setAdminQueryData("admin:orders:b", 2, 30_000);
    setAdminQueryData("admin:users", 3, 30_000);
    invalidateAdminQueryCache("admin:orders:");
    expect(peekAdminQueryData("admin:orders:a")).toBeUndefined();
    expect(peekAdminQueryData("admin:users")).toBe(3);
  });
});
