import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchMeProfileFullBackground,
  invalidateMeProfileDedupedCache,
  peekMeProfileCached,
} from "@/lib/profile/fetch-me-profile-deduped";

vi.mock("@/lib/auth/api-auth-recovery", () => ({
  recoverFrom401Once: vi.fn(),
}));

vi.mock("@/lib/app-boot/client-boot-request-journal", () => ({
  recordBootVerifyFetch: vi.fn(),
}));

vi.mock("@/lib/dibay/shell-fetch-trace", () => ({
  logShellFetchTrace: vi.fn(),
}));

import { recoverFrom401Once } from "@/lib/auth/api-auth-recovery";

describe("fetchMeProfileFullBackground 401 recovery", () => {
  beforeEach(() => {
    invalidateMeProfileDedupedCache();
    vi.mocked(recoverFrom401Once).mockReset();
  });

  afterEach(() => {
    invalidateMeProfileDedupedCache();
    vi.restoreAllMocks();
  });

  it("retries once after recoverFrom401Once succeeds", async () => {
    vi.mocked(recoverFrom401Once).mockResolvedValue({ recovered: true });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "Content-Type": "application/json" } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, profile: { id: "u1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMeProfileFullBackground("test");
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recoverFrom401Once).toHaveBeenCalledWith("me_profile_full");
    expect(peekMeProfileCached()?.status).toBe(200);
  });

  it("does not cache soft 401 when recovery is non-terminal", async () => {
    vi.mocked(recoverFrom401Once).mockResolvedValue({
      recovered: false,
      terminal: false,
      phase: "loading",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "Content-Type": "application/json" } })
      )
    );

    const result = await fetchMeProfileFullBackground("test-soft");
    expect(result.status).toBe(401);
    expect(peekMeProfileCached()).toBeNull();
  });

  it("caches terminal 401 after failed recovery", async () => {
    vi.mocked(recoverFrom401Once).mockResolvedValue({
      recovered: false,
      terminal: true,
      phase: "corrupt",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "Content-Type": "application/json" } })
      )
    );

    const result = await fetchMeProfileFullBackground("test-terminal");
    expect(result.status).toBe(401);
    expect(peekMeProfileCached()?.status).toBe(401);
  });
});
