// @vitest-environment jsdom
/**
 * 내정보 당겨서 새로고침 (docs/audit/mypage-ptr-2026-11-27 §1·§3-5).
 * 기존 `refresh()` 는 캐시(앱 시작 프로필)를 먼저 써서 서버를 안 부른다 → 당김은 `refreshFresh()` 로
 * 프로필 캐시 건너뜀(`fetchMeProfileFresh`) · 주소 force 를 반드시 부르고, 실패면 화면 값을 바꾸지 않고 error.
 */
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const P1 = { id: VIEWER, nickname: "before", updated_at: "2026-11-27T00:00:00Z" };
const P2 = { id: VIEWER, nickname: "after", updated_at: "2026-11-27T01:00:00Z" };
const ADDR_OK = { status: "complete", publicLabel: "Makati", activeCount: 1 };

const fetchFresh = vi.fn();
const fetchAddr = vi.fn();

vi.mock("@/lib/auth/get-current-user", () => ({ getCurrentUser: () => ({ id: VIEWER }) }));
vi.mock("@/lib/app-boot/app-boot-store", () => ({ getAppBootSnapshot: () => ({ status: "ready" }) }));
vi.mock("@/lib/app-boot/run-app-boot", () => ({ requestAppBootProfileRecovery: vi.fn() }));
vi.mock("@/components/addresses/MandatoryAddressGate", () => ({ SAMARKET_ADDRESSES_UPDATED_EVENT: "test-addr-updated" }));
vi.mock("@/lib/addresses/fetch-address-defaults-client", () => ({
  fetchAddressDefaultsSnapshot: (...a: unknown[]) => fetchAddr(...a),
  peekFreshAddressDefaultsSnapshot: () => ADDR_OK,
}));
vi.mock("@/lib/mypage/required-address-from-snapshot", () => ({
  resolveRequiredAddressFromSnapshot: (snap: unknown) => snap ?? { status: "unknown", publicLabel: null, activeCount: null },
}));
vi.mock("@/lib/mypage/mypage-home-snapshot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mypage/mypage-home-snapshot")>()),
  clearMypageHomeCaches: vi.fn(),
  peekMypageHomeSessionLite: () => null,
  writeMypageHomeSessionLite: vi.fn(),
}));
vi.mock("@/lib/mypage/resolve-mypage-home-profile", () => ({
  resolveMypageHomeProfileResult: async () => ({ ok: true, profile: P1 }),
}));
vi.mock("@/lib/profile/fetch-me-profile-deduped", () => ({ fetchMeProfileFresh: (...a: unknown[]) => fetchFresh(...a) }));
vi.mock("@/lib/runtime/dibay-myinfo-perf", () => ({ dibayMyInfoPerfMark: vi.fn(), dibayMyInfoPerfMaybeLogTotal: vi.fn() }));
vi.mock("@/lib/runtime/mypage-network-markers", () => ({ bumpMypageMountGeneration: vi.fn() }));
vi.mock("@/lib/stores/owner-lite-external-store", () => ({ cancelPendingOwnerLiteAutoHydrate: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Model = ReturnType<typeof import("@/hooks/use-mypage-home-model").useMypageHomeModel>;
const seen: { current: Model | null } = { current: null };
let root: Root | null = null;

async function mount() {
  const { useMypageHomeModel } = await import("@/hooks/use-mypage-home-model");
  function Probe() {
    const m = useMypageHomeModel(true);
    useEffect(() => {
      seen.current = m;
    });
    return null;
  }
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(createElement(Probe));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(async () => {
  vi.resetModules();
  fetchFresh.mockReset();
  fetchAddr.mockReset();
  seen.current = null;
  const store = await import("@/lib/mypage/mypage-home-store");
  store.clearMypageHomeStore();
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe("useMypageHomeModel.refreshFresh — 당김은 캐시를 건너뛴다", () => {
  it("성공: 프로필 fresh · 주소 force 호출 후 새 값으로 바뀐다", async () => {
    await mount();
    expect(seen.current?.projection?.profile).toEqual(P1);
    expect(fetchFresh).not.toHaveBeenCalled();
    fetchFresh.mockResolvedValue(P2);
    fetchAddr.mockResolvedValue(ADDR_OK);
    let out: string | undefined;
    await act(async () => {
      out = await seen.current!.refreshFresh();
    });
    expect(out).toBe("success");
    expect(fetchFresh).toHaveBeenCalledWith("mypage_ptr");
    expect(fetchAddr).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    expect(seen.current?.projection?.profile).toEqual(P2);
  });

  it("프로필 실패: error · 화면 값 그대로", async () => {
    await mount();
    fetchFresh.mockResolvedValue(null);
    fetchAddr.mockResolvedValue(ADDR_OK);
    let out: string | undefined;
    await act(async () => {
      out = await seen.current!.refreshFresh();
    });
    expect(out).toBe("error");
    expect(seen.current?.projection?.profile).toEqual(P1);
    expect(seen.current?.loadFailed).toBe(false);
  });

  it("주소 실패: 프로필은 새 값 · 주소는 이전 값 유지 · error", async () => {
    await mount();
    fetchFresh.mockResolvedValue(P2);
    fetchAddr.mockRejectedValue(new Error("offline"));
    let out: string | undefined;
    await act(async () => {
      out = await seen.current!.refreshFresh();
    });
    expect(out).toBe("error");
    expect(seen.current?.projection?.profile).toEqual(P2);
    expect(seen.current?.projection?.addressStatus).toBe("complete");
    expect(seen.current?.projection?.addressPublicLabel).toBe("Makati");
  });
});
