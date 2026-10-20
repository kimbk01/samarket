import { afterEach, describe, expect, it, vi } from "vitest";
import { getFavoritedStores } from "@/lib/stores/get-favorited-stores-client";

/** S22 매장 탭 — 조회 실패를 로그인 필요(authenticated:false)로 바꾸지 않는다 */
function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("getFavoritedStores", () => {
  it("500 → error (로그인 이동 아님)", async () => {
    mockFetch(500, { items: [] });
    expect(await getFavoritedStores()).toEqual({ items: [], authenticated: true, error: true });
  });
  it("네트워크 실패 → error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await getFavoritedStores()).toEqual({ items: [], authenticated: true, error: true });
  });
  it("401 → 비로그인", async () => {
    mockFetch(401, {});
    expect(await getFavoritedStores()).toEqual({ items: [], authenticated: false });
  });
  it("200 정상", async () => {
    mockFetch(200, { items: [{ id: "s1" }], authenticated: true });
    expect(await getFavoritedStores()).toEqual({ items: [{ id: "s1" }], authenticated: true });
  });
});
