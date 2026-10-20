/** v2.1 B2 — 앱 메타 관리 키·값 형식 */
import { describe, expect, it } from "vitest";
import { isAppMetaKey, normalizeAppMetaValue } from "@/lib/admin-app-meta/app-meta-keys";

describe("app meta keys", () => {
  it("관리 키 4종만 허용", () => {
    expect(isAppMetaKey("android_min_version_code")).toBe(true);
    expect(isAppMetaKey("anything_else")).toBe(false);
  });

  it.each([
    ["app_version", " 1.2.3 ", "1.2.3"],
    ["app_version", "v1", null],
    ["app_build", "42", "42"],
    ["app_build", "4a", null],
    ["android_min_version_code", "120", "120"],
    ["android_min_version_code", "-1", null],
    ["android_immediate_update", "TRUE", "true"],
    ["android_immediate_update", "yes", null],
    ["app_build", "  ", ""],
  ] as const)("%s=%j → %j", (key, raw, expected) => {
    expect(normalizeAppMetaValue(key, raw)).toBe(expected);
  });
});
