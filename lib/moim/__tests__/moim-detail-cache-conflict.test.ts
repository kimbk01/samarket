import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 재감사 M2 — 다른 운영진이 먼저 고쳐 저장이 충돌(moim_conflict)나면, 다음 상세 불러오기는 저장값이 아니라 서버의 최신 값이어야 한다 */

vi.mock("@/lib/auth/get-current-user", () => ({ getHydrationSafeCurrentUser: () => ({ id: "u-staff" }) }));
vi.mock("@/lib/auth/phone-verification-required-client", () => ({ openPhoneVerificationRequiredSheet: vi.fn() }));

import { moimApi } from "@/lib/moim/moim-client-api";
import { invalidateMoimDetailCache } from "@/lib/moim/moim-detail-cache";

const fetchMock = vi.fn();
const json = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  invalidateMoimDetailCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("모임 상세 공유 — 쓰기 뒤 비우기", () => {
  it("쓰기가 실패(충돌)해도 비워서 다음 불러오기는 서버의 새 값", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ ok: true, moim: { id: "m1", updatedAt: "old" } }))
      .mockResolvedValueOnce(json({ ok: false, error: "moim_conflict" }))
      .mockResolvedValueOnce(json({ ok: true, moim: { id: "m1", updatedAt: "new" } }));
    const first = await moimApi.detail("m1");
    expect(first.ok && first.moim.updatedAt).toBe("old");
    await moimApi.leave("m1");
    const second = await moimApi.detail("m1");
    expect(second.ok && second.moim.updatedAt).toBe("new");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("쓰기가 없으면 60초 안 다시 열어도 서버 요청 없음", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, moim: { id: "m1", updatedAt: "x" } }));
    await moimApi.detail("m1");
    await moimApi.detail("m1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("쓰기 응답이 끊겨도(네트워크 예외) 비운다", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ ok: true, moim: { id: "m1", updatedAt: "old" } }))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(json({ ok: true, moim: { id: "m1", updatedAt: "new" } }));
    await moimApi.detail("m1");
    expect(await moimApi.leave("m1")).toEqual({ ok: false, error: "moim_unknown" });
    const again = await moimApi.detail("m1");
    expect(again.ok && again.moim.updatedAt).toBe("new");
  });
});
