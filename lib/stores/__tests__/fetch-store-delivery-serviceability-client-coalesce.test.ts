import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetStoreDeliveryServiceabilityClientForTests,
  fetchStoreDeliveryServiceabilityClient,
  invalidateStoreDeliveryServiceabilityClientCache,
} from "@/lib/stores/fetch-store-delivery-serviceability-client";

const OK = {
  ok: true,
  eligible: true,
  applies: true,
  reason: "eligible",
  distanceKm: 0.003,
  maxKm: 60,
  policyEnabled: true,
};

describe("fetchStoreDeliveryServiceabilityClient coalesce", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetStoreDeliveryServiceabilityClientForTests();
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => OK,
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    __resetStoreDeliveryServiceabilityClientForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("same slug parallel callers share one network fetch", async () => {
    const [a, b] = await Promise.all([
      fetchStoreDeliveryServiceabilityClient("aa11"),
      fetchStoreDeliveryServiceabilityClient("aa11"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(OK);
    expect(b).toEqual(OK);
  });

  it("same slug sequential within TTL does not re-fetch", async () => {
    await fetchStoreDeliveryServiceabilityClient("aa11");
    await fetchStoreDeliveryServiceabilityClient("aa11");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("different slug allows a fresh fetch", async () => {
    await fetchStoreDeliveryServiceabilityClient("aa11");
    await fetchStoreDeliveryServiceabilityClient("other");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidate allows fresh fetch for same slug", async () => {
    await fetchStoreDeliveryServiceabilityClient("aa11");
    invalidateStoreDeliveryServiceabilityClientCache("aa11");
    await fetchStoreDeliveryServiceabilityClient("aa11");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("address invalidation path allows fresh fetch for same slug", async () => {
    await fetchStoreDeliveryServiceabilityClient("aa11");
    // Same path as SAMARKET_ADDRESSES_UPDATED_EVENT listener
    invalidateStoreDeliveryServiceabilityClientCache();
    await fetchStoreDeliveryServiceabilityClient("aa11");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pre-aborted signal skips network", async () => {
    const ac = new AbortController();
    ac.abort();
    const aborted = await fetchStoreDeliveryServiceabilityClient("aa11", ac.signal);
    expect(aborted).toEqual({ ok: false, error: "aborted" });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("abort after start still lets sibling callers reuse the shared OK result", async () => {
    let release!: (v: { ok: boolean; json: () => Promise<typeof OK> }) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const ac = new AbortController();
    const pAbort = fetchStoreDeliveryServiceabilityClient("aa11", ac.signal);
    const pOk = fetchStoreDeliveryServiceabilityClient("aa11");
    ac.abort();
    release!({ ok: true, json: async () => OK });
    expect(await pAbort).toEqual({ ok: false, error: "aborted" });
    expect(await pOk).toEqual(OK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await fetchStoreDeliveryServiceabilityClient("aa11")).toEqual(OK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
