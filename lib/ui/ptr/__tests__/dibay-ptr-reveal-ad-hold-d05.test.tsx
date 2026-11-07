// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDibayKeyedPtrStore, createDibayPtrStore } from "@/lib/ui/ptr/create-dibay-ptr-store";
import type { DibayPtrSnapshot } from "@/lib/ui/ptr/create-dibay-ptr-store";
import { DIBAY_PTR_REVEAL_AD_HOLD_MS, DIBAY_PTR_SUCCESS_HOLD_MS } from "@/lib/ui/ptr/dibay-ptr-ssot";
import type { PtrRevealAd } from "@/lib/platform-popup/ptr-reveal-payload";

/**
 * D-05 (Owner 결정 2026-11-07): PTR 광고 띠가 보인 회차만 결과 표시 3초 · 연장 중 본문 터치·스크롤은 즉시 접힘 ·
 * 연장된 시간 안의 CTA 클릭은 click 기록.
 */

let scrollRoot: HTMLDivElement;
let scrollListener: (() => void) | null = null;
let scrollTop = 0;
vi.mock("@/lib/layout/main-app-scroll-root", () => ({
  getMainAppScrollRootCached: () => scrollRoot,
  getMainAppScrollTop: () => scrollTop,
  invalidateMainAppScrollRootCache: () => {},
}));
vi.mock("@/lib/layout/subscribe-app-shell-scroll", () => ({
  subscribeAppShellScroll: (l: () => void) => {
    scrollListener = l;
    return () => {
      scrollListener = null;
    };
  },
}));

const recordMock = vi.fn((_e: { eventType: string }) => Promise.resolve());
vi.mock("@/lib/platform-popup/record-popup-event-client", () => ({
  recordPlatformPopupEvent: (e: { eventType: string }) => recordMock(e),
}));
const AD: PtrRevealAd = {
  campaignId: "c-1",
  surface: "community",
  href: "/events/e-1",
  ctaLabel: null,
  title: null,
  frequencyMode: "once_per_session",
  suppressionDurationSeconds: null,
  timezone: "Asia/Manila",
  bands: { default: { creativeId: "cr-1", imageUrl: "https://x/band.png", altText: "" }, tablet: null, logo: null },
};
vi.mock("@/lib/platform-popup/ptr-reveal-client", () => ({
  ensurePtrRevealAd: () => {},
  finishPtrRevealExposure: () => {},
  getPtrRevealAdsVersion: () => 0,
  notePtrRevealIdentity: () => {},
  readPtrRevealAd: () => AD,
  subscribePtrRevealAds: () => () => {},
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/philife", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth/client-instance-id", () => ({ ensureClientInstanceId: () => "dev-1" }));
vi.mock("@/hooks/use-client-membership-state", () => ({ useClientMembershipState: () => ({ status: "anonymous" }) }));
vi.mock("@/lib/platform-promotion-lifecycle/client-record-content-visit", () => ({
  recordPromotionContentVisitClient: () => {},
}));
vi.mock("@/lib/destination/open-destination", () => ({
  openDestination: () => true,
  notifyDestinationOpenFailed: () => {},
}));

const timings = { minSpinMs: 100, successHoldMs: 200, errorHoldMs: 300, handlerTimeoutMs: 1000, revealAdHoldMs: 1000 };

describe("D-05 store — 광고 띠가 보였을 때만 결과 표시 연장", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("상수: 광고 있음 3000ms · 없음 700ms 그대로", () => {
    expect(DIBAY_PTR_REVEAL_AD_HOLD_MS).toBe(3000);
    expect(DIBAY_PTR_SUCCESS_HOLD_MS).toBe(700);
  });

  it("광고 없음: 성공 표시는 successHoldMs 뒤 접힘 (변경 없음)", async () => {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    store.addHandler(async () => "success" as const);
    const p = store.run(70);
    await vi.advanceTimersByTimeAsync(100);
    expect(store.getSnapshot().phase).toBe("SUCCESS");
    await vi.advanceTimersByTimeAsync(200);
    expect(store.getSnapshot().phase).toBe("IDLE");
    await p;
  });

  it("광고 띠 보임: 성공 표시를 revealAdHoldMs 까지 연장", async () => {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    store.addHandler(async () => "success" as const);
    const p = store.run(70);
    store.noteRevealAdVisible(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(store.getSnapshot().phase).toBe("SUCCESS");
    await vi.advanceTimersByTimeAsync(200);
    expect(store.getSnapshot().phase).toBe("SUCCESS");
    await vi.advanceTimersByTimeAsync(799);
    expect(store.getSnapshot().phase).toBe("SUCCESS");
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getSnapshot().phase).toBe("IDLE");
    await p;
  });

  it("광고 띠 보임: 실패 표시도 같은 하한(errorHold 300 → 1000)", async () => {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    store.addHandler(async () => "error" as const);
    const p = store.run(70);
    store.noteRevealAdVisible(true);
    await vi.advanceTimersByTimeAsync(100 + 300);
    expect(store.getSnapshot().phase).toBe("ERROR");
    await vi.advanceTimersByTimeAsync(700);
    expect(store.getSnapshot().phase).toBe("IDLE");
    await p;
  });

  it("거래(키 저장소)도 같은 신호를 받는다", async () => {
    const store = createDibayKeyedPtrStore({ preflight: () => {}, timings });
    store.addHandler("k", async () => "success" as const);
    const p = store.run(70, "k");
    store.noteRevealAdVisible(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(store.getSnapshot().phase).toBe("SUCCESS");
    await vi.advanceTimersByTimeAsync(800);
    expect(store.getSnapshot().phase).toBe("IDLE");
    await p;
  });
});

function touch(target: Element, type: "touchstart" | "touchend", y = 100): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "touches", { value: type === "touchstart" ? [{ clientX: 50, clientY: y }] : [] });
  target.dispatchEvent(ev);
}

describe("D-05 연장 중 본문 터치·스크롤 즉시 접힘 · 헤더 CTA 클릭 기록", () => {
  let host: HTMLDivElement;
  let header: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    recordMock.mockClear();
    scrollTop = 0;
    scrollRoot = document.createElement("div");
    header = document.createElement("div");
    header.setAttribute("data-app-sticky-header", "");
    document.body.append(header, scrollRoot);
    host = document.createElement("div");
    header.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    header.remove();
    scrollRoot.remove();
    vi.useRealTimers();
  });

  async function mountWithAd() {
    const store = createDibayPtrStore({ preflight: () => {}, timings });
    store.addHandler(async () => "success" as const);
    const { useDibayPtrGesture } = await import("@/lib/ui/ptr/use-dibay-ptr-gesture");
    const { useDibayPtrRevealAd } = await import("@/components/ptr/DibayPtrRevealAdLayer");
    const { useSyncExternalStore } = await import("react");
    const ref: { reveal: ReturnType<typeof useDibayPtrRevealAd> | null; snap: DibayPtrSnapshot | null } = {
      reveal: null,
      snap: null,
    };
    function Probe() {
      // 커뮤니티·거래와 같은 구조: 제스처는 본문 스크롤 루트만(bindStickyHeader 없음), 띠는 헤더에 그림
      useDibayPtrGesture({ enabled: true, store, onRelease: () => {}, rootDatasetKey: "d05Ptr" });
      const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
      const reveal = useDibayPtrRevealAd(snap, 375, undefined, store.noteRevealAdVisible);
      ref.reveal = reveal;
      ref.snap = snap;
      return reveal.active ? <button type="button" data-ptr-reveal-cta onClick={reveal.onCta} /> : null;
    }
    act(() => root.render(<Probe />));
    let runP: Promise<unknown> = Promise.resolve();
    await act(async () => {
      runP = store.run(70);
    });
    // 띠 이미지 표시 → 노출 기록 → 저장소에 「광고 띠 보임」
    await act(async () => {
      ref.reveal?.onImageShown(AD.bands.default.imageUrl);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(store.getSnapshot().phase).toBe("SUCCESS");
    expect(recordMock.mock.calls.map((c) => c[0].eventType)).toContain("impression");
    // 성공 표시 기본(200ms)이 지나도 광고가 있으면 남는다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(store.getSnapshot().phase).toBe("SUCCESS");
    return { store, ref, runP };
  }

  it("연장 중 본문 터치 → 즉시 접힘(IDLE)", async () => {
    const { store, runP } = await mountWithAd();
    await act(async () => {
      touch(scrollRoot, "touchstart");
      touch(scrollRoot, "touchend");
    });
    expect(store.getSnapshot().phase).toBe("IDLE");
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await runP;
  });

  it("연장 중 본문 스크롤 → 즉시 접힘(IDLE)", async () => {
    const { store, runP } = await mountWithAd();
    scrollTop = 40;
    await act(async () => {
      scrollListener?.();
    });
    expect(store.getSnapshot().phase).toBe("IDLE");
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await runP;
  });

  it("CTA 는 손가락 감지 밖(헤더) — 탭해도 접히지 않고, 연장 시간 안 클릭은 click·landing 기록", async () => {
    const { store, runP } = await mountWithAd();
    const cta = header.querySelector("[data-ptr-reveal-cta]") as HTMLButtonElement;
    expect(cta).toBeTruthy();
    expect(scrollRoot.contains(cta)).toBe(false);
    await act(async () => {
      touch(cta, "touchstart");
      touch(cta, "touchend");
    });
    expect(store.getSnapshot().phase).toBe("SUCCESS");
    await act(async () => {
      cta.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const types = recordMock.mock.calls.map((c) => c[0].eventType);
    expect(types).toContain("click");
    expect(types).toContain("landing_success");
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await runP;
  });
});
