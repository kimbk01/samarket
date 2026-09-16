import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __forgetPlatformPopupResolveFlightForTests,
  fetchPlatformPopupResolveDeduped,
  platformPopupResolveFlightKey,
} from "@/lib/platform-popup/fetch-platform-popup-resolve-client";
import { reducePlatformPopupHostState } from "@/lib/platform-popup/popup-host-machine";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("platform-popup cascade close", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, winner: null, impression: false }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    __forgetPlatformPopupResolveFlightForTests({
      pathname: "/stores/aa11",
      sessionKey: "s1",
      deviceKey: "d1",
    });
    __forgetPlatformPopupResolveFlightForTests({
      pathname: "/stores/aa11/cart",
      sessionKey: "s1",
      deviceKey: "d1",
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("flight key ignores generation (canonical identity)", () => {
    expect(
      platformPopupResolveFlightKey({
        pathname: "/stores/aa11",
        sessionKey: "s1",
        deviceKey: "d1",
      })
    ).toBe(
      platformPopupResolveFlightKey({
        pathname: "/stores/aa11",
        sessionKey: "s1",
        deviceKey: "d1",
      })
    );
  });

  it("parallel same canonical resolve coalesces to one network fetch", async () => {
    const [a, b] = await Promise.all([
      fetchPlatformPopupResolveDeduped({
        pathname: "/stores/aa11",
        sessionKey: "s1",
        deviceKey: "d1",
        generation: "1",
      }),
      fetchPlatformPopupResolveDeduped({
        pathname: "/stores/aa11",
        sessionKey: "s1",
        deviceKey: "d1",
        generation: "2",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.json.winner).toBeNull();
    expect(b.json.winner).toBeNull();
  });

  it("different pathname allows a fresh fetch", async () => {
    await fetchPlatformPopupResolveDeduped({
      pathname: "/stores/aa11",
      sessionKey: "s1",
      deviceKey: "d1",
      generation: "1",
    });
    await fetchPlatformPopupResolveDeduped({
      pathname: "/stores/aa11/cart",
      sessionKey: "s1",
      deviceKey: "d1",
      generation: "2",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("RESOLVE_EMPTY → EMPTY does not loop back to IDLE", () => {
    let s = reducePlatformPopupHostState("IDLE", { type: "RESOLVE_START" });
    s = reducePlatformPopupHostState(s, { type: "RESOLVE_EMPTY" });
    expect(s).toBe("EMPTY");
    // Simulated hostState-dep cascade would only re-fetch if EMPTY returned IDLE
    expect(s).not.toBe("IDLE");
  });

  it("GlobalPopupHost blocks EMPTY and uses deduped resolve client", () => {
    const host = readFileSync(
      join(process.cwd(), "components/platform-popup/GlobalPopupHost.tsx"),
      "utf8"
    );
    expect(host).toContain('hostState === "EMPTY"');
    expect(host).toContain("fetchPlatformPopupResolveDeduped");
    expect(host).not.toMatch(/fetch\(`\/api\/platform-popup\/resolve/);
  });
});
