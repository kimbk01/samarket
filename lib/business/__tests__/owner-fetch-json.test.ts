/**
 * 4-0 (RC-11) — `ownerFetchJson`: 네트워크 예외·비 JSON·HTTP 코드·서버 error 코드를 한 결과로 모은다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerFetchErrorMessage, ownerFetchJson } from "@/lib/business/owner-fetch-json";

const fetchMock = vi.fn();

function res(status: number, body: string) {
  return Promise.resolve(new Response(body, { status, headers: { "content-type": "application/json" } }));
}

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("ownerFetchJson", () => {
  it("ok:true body → success with data, credentials included", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementationOnce(() => res(200, JSON.stringify({ ok: true, v: 1 })));
    const r = await ownerFetchJson<{ ok: true; v: number }>("/api/x", { method: "PATCH" });
    expect(r).toEqual({ ok: true, status: 200, data: { ok: true, v: 1 } });
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe("include");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("PATCH");
  });

  it("fetch throws → network_error (status 0), no throw", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
    const r = await ownerFetchJson("/api/x");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("network_error");
      expect(r.status).toBe(0);
      expect(r.stateKind).toBeNull();
    }
  });

  it("non-JSON body on 502 → request_failed, body null", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementationOnce(() => res(502, "<html>"));
    const r = await ownerFetchJson("/api/x");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("request_failed");
      expect(r.body).toBeNull();
    }
  });

  it("200 with non-ok body → invalid_response; server error code wins", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementationOnce(() => res(200, "{}"));
    const a = await ownerFetchJson("/api/x");
    expect(!a.ok && a.code).toBe("invalid_response");
    fetchMock.mockImplementationOnce(() => res(409, JSON.stringify({ ok: false, error: "store_changed" })));
    const b = await ownerFetchJson("/api/x");
    expect(!b.ok && b.code).toBe("store_changed");
    expect(!b.ok && b.status).toBe(409);
  });

  it("401/403 → no_permission state signal", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementationOnce(() => res(403, "not json"));
    const r = await ownerFetchJson("/api/x");
    expect(!r.ok && r.stateKind).toBe("no_permission");
    expect(!r.ok && r.code).toBe("forbidden");
    fetchMock.mockImplementationOnce(() => res(401, JSON.stringify({ ok: false, error: "unauthorized" })));
    const u = await ownerFetchJson("/api/x");
    expect(!u.ok && u.stateKind).toBe("no_permission");
  });

  it("error message uses owner-api-error-i18n mapping", () => {
    const t = (k: string) => k;
    expect(ownerFetchErrorMessage({ code: "network_error" }, t as never)).toBe("common_network_error");
    expect(ownerFetchErrorMessage({ code: "request_failed" }, t as never)).toBe("business_phase7_426");
  });
});
