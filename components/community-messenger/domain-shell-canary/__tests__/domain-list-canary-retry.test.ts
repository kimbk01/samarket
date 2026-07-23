import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDomainListCanaryWithRetry } from "@/components/community-messenger/domain-shell-canary/domain-list-canary-retry";

describe("fetchDomainListCanaryWithRetry", () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.useRealTimers();
  });

  function okResponse(): Response {
    return { ok: true, status: 200 } as Response;
  }
  function nokResponse(status: number): Response {
    return { ok: false, status } as Response;
  }

  it("returns success without retry when the first attempt is ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await fetchDomainListCanaryWithRetry("/api/x");
    expect(result).toEqual({ ok: true, res: okResponse(), retried: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once and succeeds when the first attempt is non-ok", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(nokResponse(503))
      .mockResolvedValueOnce(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;
    const promise = fetchDomainListCanaryWithRetry("/api/x");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.retried).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rolls back after both attempts are non-ok", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(nokResponse(500))
      .mockResolvedValueOnce(nokResponse(503));
    global.fetch = fetchMock as unknown as typeof fetch;
    const promise = fetchDomainListCanaryWithRetry("/api/x");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.threw).toBe(false);
      expect(result.res?.status).toBe(503);
      expect(result.retried).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rolls back after both attempts throw", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;
    const promise = fetchDomainListCanaryWithRetry("/api/x");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.threw).toBe(true);
      expect(result.res).toBeNull();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recovers when the exception attempt is followed by a healthy retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;
    const promise = fetchDomainListCanaryWithRetry("/api/x");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.retried).toBe(true);
  });
});
