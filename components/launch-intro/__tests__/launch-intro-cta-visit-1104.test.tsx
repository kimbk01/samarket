// @vitest-environment jsdom
/**
 * IN-N3 · CX-02 (2026-11-04) — 인트로 CTA 이동 후 콘텐츠 방문 기록. 실제 LaunchIntroRoot 를 렌더하고 CTA 를 누른다.
 * - 목적지가 이벤트(/events/{id}) → recordPromotionContentVisitClient({ sourceChannel: "INTRO" }) 1회 + router.replace
 * - 이벤트가 아닌 목적지 → 기록 0 · 금지 경로 → 이동·기록 0
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  record: vi.fn(),
  ctaPath: "/events/evt-1",
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: { hide: async () => {} } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace, push: h.push }) }));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/platform-promotion-lifecycle/client-record-content-visit", () => ({
  recordPromotionContentVisitClient: h.record,
}));
vi.mock("@/lib/launch-intro/discovery", () => ({ startLaunchIntroDiscovery: () => {} }));
vi.mock("@/lib/launch-intro/frequency", () => ({ recordLaunchIntroShown: () => {} }));
vi.mock("@/lib/launch-intro/launch-epoch", () => ({ markLaunchEpochShown: () => {} }));
vi.mock("@/lib/lifecycle/launch-intent.client", () => ({ hasLaunchIntent: async () => null }));
vi.mock("@/lib/device/dibay-device-class", () => ({ resolveDibayDeviceClass: async () => ({ deviceClass: "PHONE" }) }));
vi.mock("@/lib/launch-intro/cache", () => ({ invalidateLaunchIntroIndex: () => {}, loadLaunchIntroAssetUrl: async () => null }));
vi.mock("@/components/launch-intro/LaunchIntroPlayer", () => ({
  LaunchIntroPlayer: (p: { onRoute: (path: string) => void }) => (
    <button type="button" data-test-cta="" onClick={() => p.onRoute(h.ctaPath)}>
      cta
    </button>
  ),
}));
vi.mock("@/lib/launch-intro/startup-destination", async () => {
  const { emptyLaunchIntroDocument } = await import("@/lib/launch-intro/document");
  return {
    getLaunchDestination: () => ({
      destination: "intro",
      reason: "snapshot",
      snapshot: {
        epoch: "epoch-1",
        revision: 1,
        publication: { id: "pub-1", document: emptyLaunchIntroDocument(), assets: [], eligibility: { frequency: "every_launch" } },
      },
    }),
    getLaunchIntroDeferral: () => null,
    releaseLaunchIntroDeferral: () => {},
    abortLaunchIntroToCommunity: () => {},
  };
});

const flush = async (n = 20) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
let host: HTMLDivElement;
let root: Root;

async function showAndTapCta() {
  const owner = await import("@/lib/launch-intro/os-release-owner");
  expect(owner.claimLaunchOsReleaseForIntro()).toBe(true);
  const { LaunchIntroRoot } = await import("@/components/launch-intro/LaunchIntroRoot");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <LaunchIntroRoot>
        <div />
      </LaunchIntroRoot>
    );
  });
  await act(async () => flush());
  expect(document.querySelector("[data-launch-intro-overlay]")).not.toBeNull();
  await act(async () => {
    (document.querySelector("[data-test-cta]") as HTMLButtonElement).click();
  });
}

beforeEach(() => {
  vi.resetModules();
  h.replace.mockClear();
  h.push.mockClear();
  h.record.mockClear();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  if (typeof globalThis.requestAnimationFrame !== "function") {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
  }
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

describe("IN-N3 · CX-02 — 인트로 CTA 방문 기록", () => {
  it("이벤트 목적지 → 방문 기록 1회(출처 INTRO) + router.replace(push 아님)", async () => {
    h.ctaPath = "/events/evt-1";
    await showAndTapCta();
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledWith({ hrefOrEventId: "/events/evt-1", sourceChannel: "INTRO" });
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/events/evt-1");
    expect(h.push).not.toHaveBeenCalled();
  });

  it("이벤트가 아닌 목적지 → 기록 0 · 이동은 그대로", async () => {
    h.ctaPath = "/philife/abc";
    await showAndTapCta();
    expect(h.record).not.toHaveBeenCalled();
    expect(h.replace).toHaveBeenCalledWith("/philife/abc");
  });

  it("회원 금지 경로 → 이동·기록 0 (건너뛰기와 같음)", async () => {
    h.ctaPath = "/admin/events/evt-1";
    await showAndTapCta();
    expect(h.record).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
  });
});
