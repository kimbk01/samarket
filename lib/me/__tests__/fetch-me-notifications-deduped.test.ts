import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveClientAuthenticatedUserIdForFetch = vi.fn<() => Promise<string | null>>();
let syncViewerUserId: string | undefined;

vi.mock("@/lib/auth/resolve-client-authenticated-user-id-for-fetch", () => ({
  resolveClientAuthenticatedUserIdForFetch: () => resolveClientAuthenticatedUserIdForFetch(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getSyncViewerUserIdForClient: () => syncViewerUserId,
  getCurrentUserIdForDb: async () => syncViewerUserId ?? null,
}));

describe("fetch-me-notifications-deduped", () => {
  beforeEach(() => {
    vi.resetModules();
    syncViewerUserId = undefined;
    resolveClientAuthenticatedUserIdForFetch.mockReset();
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, notifications: [{ id: "n1" }] }), { status: 200 })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loadModule() {
    const mod = await import("@/lib/me/fetch-me-notifications-deduped");
    mod.resetMeNotificationsListDedupedClientForTests();
    return mod;
  }

  it("returns empty unauthenticated result with zero fetch when session is null", async () => {
    resolveClientAuthenticatedUserIdForFetch.mockResolvedValue(null);
    const mod = await loadModule();

    const result = await mod.fetchMeNotificationsListDeduped();

    expect(fetch).not.toHaveBeenCalled();
    expect(result.status).toBe(401);
    expect(result.json).toEqual({ ok: false, notifications: [] });
  });

  it("blocks force:true fetch during unauthorized backoff after 401", async () => {
    resolveClientAuthenticatedUserIdForFetch.mockResolvedValue("user-1");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const mod = await loadModule();

    await mod.fetchMeNotificationsListDeduped();
    await mod.fetchMeNotificationsListDeduped({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches when session exists", async () => {
    syncViewerUserId = "user-1";
    resolveClientAuthenticatedUserIdForFetch.mockResolvedValue("user-1");
    const mod = await loadModule();

    const result = await mod.fetchMeNotificationsListDeduped();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ ok: true, notifications: [{ id: "n1" }] });
  });

  it("does not hit network immediately after auth exit pause while logged out", async () => {
    resolveClientAuthenticatedUserIdForFetch.mockResolvedValue(null);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, notifications: [] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const mod = await loadModule();

    mod.pauseMeNotificationsListDedupedAfterAuthExit();
    await mod.fetchMeNotificationsListDeduped({ force: true });

    expect(fetchMock).not.toHaveBeenCalled();
    expect((await mod.fetchMeNotificationsListDeduped({ force: true })).status).toBe(401);
  });

  it("clears auth exit pause when session is confirmed", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, notifications: [{ id: "n2" }] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const mod = await loadModule();

    mod.pauseMeNotificationsListDedupedAfterAuthExit();
    resolveClientAuthenticatedUserIdForFetch.mockResolvedValue(null);
    await mod.fetchMeNotificationsListDeduped({ force: true });
    expect(fetchMock).not.toHaveBeenCalled();

    syncViewerUserId = "user-1";
    resolveClientAuthenticatedUserIdForFetch.mockResolvedValue("user-1");
    const result = await mod.fetchMeNotificationsListDeduped({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
  });
});
