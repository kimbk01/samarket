// @vitest-environment jsdom
/**
 * T1 — boot `error`(로그인 확인 + 프로필 실패)에서 /market 위치 hydrate 가 address-defaults 401(`pending_auth`)을 받으면
 * 오지 않을 수 있는 boot 이벤트를 무기한 기다리지 않고 제한 재시도 후 failed(재시도 UI)로 끝난다.
 * boot 진행 중(hydrating)에는 기존대로 boot 이벤트를 기다린다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({
  search: "",
  cache: new Map<string, URLSearchParams>(),
  router: null as unknown as { replace: unknown; push: () => void; prefetch: () => void },
  replace: vi.fn((href: string) => {
    nav.search = href.includes("?") ? href.split("?")[1] : "";
  }),
}));
nav.router = { replace: nav.replace, push: () => {}, prefetch: () => {} };

vi.mock("next/navigation", () => ({
  usePathname: () => "/market",
  useSearchParams: () => {
    let sp = nav.cache.get(nav.search);
    if (!sp) {
      sp = new URLSearchParams(nav.search);
      nav.cache.set(nav.search, sp);
    }
    return sp;
  },
  useRouter: () => nav.router,
}));

vi.spyOn(console, "info").mockImplementation(() => {});

import { resetAppBootStore, setAppBootHydrating, setAppBootProfileUnavailable } from "@/lib/app-boot/app-boot-store";
import { resetGuestAuthStateForTests } from "@/lib/auth/guest-auth-state";
import { invalidateAddressDefaultsSnapshotCache } from "@/lib/addresses/fetch-address-defaults-client";
import {
  TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS,
  useTradeMarketplaceLocationHydrate,
} from "@/lib/trade/location/use-trade-marketplace-location-hydrate";

let addressCalls = 0;
let container: HTMLDivElement;
let root: Root;
const probe: { current: ReturnType<typeof useTradeMarketplaceLocationHydrate> | null } = { current: null };

function Harness() {
  const state = useTradeMarketplaceLocationHydrate();
  useEffect(() => {
    probe.current = state;
  });
  return null;
}

async function flush() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** 다음 재시도 타이머는 이전 요청이 끝난 뒤 예약되므로 단계별로 진행한다. */
async function advance(ms: number) {
  const step = 500;
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    await act(async () => {
      vi.advanceTimersByTime(step);
    });
    await flush();
  }
}

const RETRY_TOTAL_MS = TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) + 5_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  resetAppBootStore();
  resetGuestAuthStateForTests();
  invalidateAddressDefaultsSnapshotCache();
  nav.search = "";
  nav.replace.mockClear();
  addressCalls = 0;
  probe.current = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/me/address-defaults")) addressCalls += 1;
      return new Response(JSON.stringify({ ok: false }), { status: 401 });
    }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mount() {
  await act(async () => {
    root.render(createElement(Harness));
  });
  await flush();
}

describe("T1 — boot error 에서 위치 hydrate 제한 재시도", () => {
  it("boot error + 401 → 제한 재시도 후 failed (무한 loading 아님, 가짜 ALL 아님)", async () => {
    setAppBootProfileUnavailable("profile_fetch_failed");
    await mount();
    await advance(RETRY_TOTAL_MS);
    expect(probe.current?.unresolved).toBe(false);
    expect(probe.current?.failed).toBe(true);
    expect(probe.current?.scope.mode).toBe("unset");
    expect(addressCalls).toBe(1 + TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS.length);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("failed 뒤 retry 는 새 주소 요청을 보낸다", async () => {
    setAppBootProfileUnavailable("profile_fetch_failed");
    await mount();
    await advance(RETRY_TOTAL_MS);
    const before = addressCalls;
    await act(async () => {
      probe.current?.retry();
    });
    await flush();
    expect(addressCalls).toBe(before + 1);
    expect(probe.current?.failed).toBe(false);
  });

  it("boot 진행 중(hydrating) + 401 → 기존대로 boot 이벤트를 기다린다 (시간 재시도 없음)", async () => {
    setAppBootHydrating();
    await mount();
    await advance(RETRY_TOTAL_MS);
    expect(addressCalls).toBe(1);
    expect(probe.current?.failed).toBe(false);
    expect(probe.current?.unresolved).toBe(true);
  });
});
