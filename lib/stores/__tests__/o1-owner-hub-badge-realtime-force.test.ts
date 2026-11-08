/**
 * O1 (Owner 「O1 구현 승인」 2026-11-09) — 사장님 새 주문 배지: 실시간 신호 때 주문 수 캐시를 비우고 서버에서 받는다.
 * docs/owner-hub-cold-path-contract.md 「Realtime 시 invalidate 후 재조회」.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

describe("fetchStoreOrderCountsDeduped — force 와 캐시", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, pending_accept_count: 7, refund_requested_count: 0, pending_delivery_count: 1 }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("캐시가 있으면 force 없이 네트워크 0, force 면 서버에서 받음", async () => {
    const cache = await import("@/lib/stores/owner-hub-order-counts-cache");
    const { fetchStoreOrderCountsDeduped } = await import("@/lib/business/fetch-store-order-counts-deduped");
    cache.seedOwnerHubOrderCountsCache("st-1", {
      pending_accept_count: 2,
      refund_requested_count: 0,
      pending_delivery_count: 0,
    });

    const cached = await fetchStoreOrderCountsDeduped("st-1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect((cached.json as { pending_accept_count: number }).pending_accept_count).toBe(2);

    const fresh = await fetchStoreOrderCountsDeduped("st-1", { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fresh.json as { pending_accept_count: number }).pending_accept_count).toBe(7);
    // 서버 값이 캐시에 들어감
    expect(cache.peekOwnerHubOrderCountsCache("st-1")?.pending_accept_count).toBe(7);
  });

  it("invalidate 후에는 force 없이도 서버에서 받음", async () => {
    const cache = await import("@/lib/stores/owner-hub-order-counts-cache");
    const { fetchStoreOrderCountsDeduped } = await import("@/lib/business/fetch-store-order-counts-deduped");
    cache.seedOwnerHubOrderCountsCache("st-1", {
      pending_accept_count: 2,
      refund_requested_count: 0,
      pending_delivery_count: 0,
    });
    cache.invalidateOwnerHubOrderCountsCache("st-1");
    await fetchStoreOrderCountsDeduped("st-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("OwnerHubRuntimeProvider 계약 (소스)", () => {
  const src = readFileSync(
    join(process.cwd(), "components/business/owner/OwnerHubRuntimeProvider.tsx"),
    "utf8"
  );

  it("실시간 주문 신호: 캐시 비움 + 강제 조회", () => {
    const rt = src.slice(src.indexOf("useSupabaseStoreOrdersRealtime(orderCountsStoreId"));
    const onChange = rt.slice(rt.indexOf("onChange:"), rt.indexOf("const value = useMemo"));
    expect(onChange).toContain("invalidateOwnerHubOrderCountsCache(orderCountsStoreId)");
    expect(onChange).toContain("refreshOrderAttention({ force: true })");
  });

  it("refreshOrderAttention 은 받은 값을 캐시에 다시 넣지 않음 (만료 연장 금지)", () => {
    const body = src.slice(
      src.indexOf("const refreshOrderAttention = useCallback"),
      src.indexOf("}, [orderCountsStoreId]);", src.indexOf("const refreshOrderAttention = useCallback"))
    );
    expect(body.length).toBeGreaterThan(100);
    expect(body).not.toContain("seedOwnerHubOrderCountsCache(");
    expect(body).toContain("force: opts?.force === true");
  });
});
