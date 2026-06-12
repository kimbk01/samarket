import { describe, expect, it } from "vitest";
import {
  invalidateAdminQueryCache,
  peekAdminQueryData,
  setAdminQueryData,
} from "@/lib/admin/admin-query-cache";

describe("useAdminQuery cache guards", () => {
  it("isolates data by query key", () => {
    setAdminQueryData("admin:a", ["a"], 30_000);
    setAdminQueryData("admin:b", ["b"], 30_000);
    expect(peekAdminQueryData<string[]>("admin:a")).toEqual(["a"]);
    expect(peekAdminQueryData<string[]>("admin:b")).toEqual(["b"]);
    invalidateAdminQueryCache("admin:a");
    expect(peekAdminQueryData("admin:a")).toBeUndefined();
    expect(peekAdminQueryData<string[]>("admin:b")).toEqual(["b"]);
  });
});
