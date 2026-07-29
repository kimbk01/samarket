import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

describe("mypage root network contract", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolveMypageHomeProfileRow uses boot snapshot without network when present", async () => {
    vi.doMock("@/lib/app-boot/app-boot-store", () => ({
      peekAppBootProfile: () => ({
        id: "viewer-1",
        nickname: "A",
        display_name: "A",
      }),
    }));
    vi.doMock("@/lib/profile/fetch-me-profile-deduped", () => ({
      fetchMeProfileDeduped: vi.fn(async () => {
        throw new Error("must not network");
      }),
      isMeProfileFullFetchSkippable: () => false,
      peekMeProfileCached: () => null,
    }));

    const { resolveMypageHomeProfileRow } = await import("@/lib/mypage/resolve-mypage-home-profile");
    const row = await resolveMypageHomeProfileRow();
    expect(row?.id).toBe("viewer-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetchAddressDefaultsSnapshot parallel callers share one network GET", async () => {
    let inflight = 0;
    let maxInflight = 0;
    fetchMock.mockImplementation(async () => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 30));
      inflight -= 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, defaults: { master: { id: "a" } } }),
      };
    });

    const mod = await import("@/lib/addresses/fetch-address-defaults-client");
    mod.invalidateAddressDefaultsSnapshotCache();
    await Promise.all([
      mod.fetchAddressDefaultsSnapshot(),
      mod.fetchAddressDefaultsSnapshot(),
      mod.fetchAddressDefaultsSnapshot(),
      mod.fetchAddressDefaultsSnapshot(),
    ]);
    expect(maxInflight).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("MypageRequiredInfoSummary source does not import address presentation hook", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/mypage/home/MypageRequiredInfoSummary.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/useRepresentativeAddressPresentation/);
    expect(src).not.toMatch(/fetchAddressDefaultsSnapshot\s*\(/);
  });
});
