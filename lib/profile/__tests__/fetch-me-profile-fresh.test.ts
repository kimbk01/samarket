import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMeProfileFresh } from "@/lib/profile/fetch-me-profile-deduped";

/** 네트워크 오류에도 throw 하지 않아 편집 화면이 로딩·저장 중 상태에 갇히지 않는다 */
describe("fetchMeProfileFresh", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns null on a transport error instead of rejecting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    await expect(fetchMeProfileFresh("test")).resolves.toBeNull();
  });

  it("returns the profile on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, profile: { id: "u1", bio: "안녕" } }), { status: 200 })));
    await expect(fetchMeProfileFresh("test")).resolves.toMatchObject({ id: "u1", bio: "안녕" });
  });
});
