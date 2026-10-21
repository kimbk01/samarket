import { describe, expect, it } from "vitest";
import { sanitizeNextPath, withNextSearchParam } from "@/lib/auth/safe-next-path";

/** P2-14 (OA-11) — 제어문자 경유 외부 리다이렉트 차단 */
describe("sanitizeNextPath control characters (P2-14)", () => {
  it("rejects tab/newline/NUL/DEL in raw next", () => {
    expect(sanitizeNextPath("/\t/evil.example")).toBeNull();
    expect(sanitizeNextPath("/\n/evil.example")).toBeNull();
    expect(sanitizeNextPath("/a\u0000b")).toBeNull();
    expect(sanitizeNextPath("/a\u007fb")).toBeNull();
  });

  it("rejects percent-encoded control characters (decoded check)", () => {
    expect(sanitizeNextPath("%2F%09%2Fevil.example")).toBeNull();
    expect(sanitizeNextPath("/%09/evil.example")).toBeNull();
    expect(sanitizeNextPath("/market?x=%0d%0aSet-Cookie")).toBeNull();
  });

  it("URLSearchParams-decoded attack payload is rejected", () => {
    const next = new URL("https://dibay.app/login?next=%2F%09%2Fevil.example").searchParams.get("next");
    expect(sanitizeNextPath(next)).toBeNull();
    expect(withNextSearchParam("/login", next)).toBe("/login");
  });

  it("keeps normal same-origin paths", () => {
    expect(sanitizeNextPath("/philife")).toBe("/philife");
    expect(sanitizeNextPath("/community/55?tab=hot")).toBe("/community/55?tab=hot");
    expect(sanitizeNextPath("%2Fmarket")).toBe("/market");
    expect(sanitizeNextPath("/search?q=50%")).toBe("/search?q=50%");
  });
});
