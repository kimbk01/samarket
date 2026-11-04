// @vitest-environment jsdom
/**
 * 광고 ② 묶음 C (시작 경로) — 동작 시험. 실제 LaunchIntroRoot + 실제 os-release-owner + 실제 startup-metrics 로
 * 렌더하고, 시작 화면 닫힘은 `@capacitor/splash-screen` 의 hide 호출 수로 센다.
 * - IN-S11 · D-16: 준비 중 예상 밖 예외 → 커뮤니티로 넘김 1회 · 시작 화면 닫힘 1회 (타이머 없음)
 * - IN-S10 · D-17: preparing 중 visibilitychange=hidden → 넘김 · 인트로 렌더 0 · 같은 epoch 표시
 * - DS-8: CTA 목표가 다른 주소로 넘어가도 exiting 오버레이가 닫힌다 · 회원 금지 경로 CTA 는 이동하지 않는다
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  hide: vi.fn(async () => {}),
  replace: vi.fn(),
  markEpoch: vi.fn(),
  abort: vi.fn(),
  releaseDeferral: vi.fn(),
  intent: vi.fn<() => Promise<string | null>>(),
  ctaPath: "/philife/abc",
  /** 이번 시험의(resetModules 뒤) 실제 해제 권한 모듈 — 모의 abort 가 이것을 부른다 */
  owner: null as null | typeof import("@/lib/launch-intro/os-release-owner"),
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: { hide: h.hide } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace, push: vi.fn() }) }));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/launch-intro/discovery", () => ({ startLaunchIntroDiscovery: () => {} }));
vi.mock("@/lib/launch-intro/frequency", () => ({ recordLaunchIntroShown: () => {} }));
vi.mock("@/lib/launch-intro/launch-epoch", () => ({ markLaunchEpochShown: h.markEpoch }));
vi.mock("@/lib/lifecycle/launch-intent.client", () => ({ hasLaunchIntent: () => h.intent() }));
vi.mock("@/lib/device/dibay-device-class", () => ({
  resolveDibayDeviceClass: async () => ({ deviceClass: "PHONE" }),
}));
vi.mock("@/lib/launch-intro/cache", () => ({
  invalidateLaunchIntroIndex: () => {},
  loadLaunchIntroAssetUrl: async () => null,
}));
vi.mock("@/components/launch-intro/LaunchIntroPlayer", () => ({
  LaunchIntroPlayer: (p: { onRoute: (path: string) => void }) => (
    <button type="button" data-test-cta="" onClick={() => p.onRoute(h.ctaPath)}>
      cta
    </button>
  ),
}));
// 시작 목적지 = INTRO (실제 결정 모듈은 epoch·index·생명주기를 읽으므로 여기서는 결과만 고정).
// 넘김(abort)은 실제 해제 권한 모듈을 그대로 부른다 — 커뮤니티가 시작 화면을 닫는 경로를 실제로 탄다.
vi.mock("@/lib/launch-intro/startup-destination", async () => {
  const { emptyLaunchIntroDocument } = await import("@/lib/launch-intro/document");
  return {
    getLaunchDestination: () => ({
      destination: "intro",
      reason: "snapshot",
      snapshot: {
        epoch: "epoch-1",
        revision: 1,
        publication: {
          id: "pub-1",
          document: emptyLaunchIntroDocument(),
          assets: [],
          eligibility: { frequency: "every_launch" },
        },
      },
    }),
    getLaunchIntroDeferral: () => null,
    releaseLaunchIntroDeferral: h.releaseDeferral,
    abortLaunchIntroToCommunity: (reason: string) => {
      h.abort(reason);
      h.owner?.handLaunchOsReleaseToCommunity();
    },
  };
});

let visibility: DocumentVisibilityState = "visible";
const flush = async (n = 20) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

let host: HTMLDivElement;
let root: Root;

async function mount() {
  const owner = await import("@/lib/launch-intro/os-release-owner");
  h.owner = owner;
  expect(owner.claimLaunchOsReleaseForIntro()).toBe(true);
  const { LaunchIntroRoot } = await import("@/components/launch-intro/LaunchIntroRoot");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <LaunchIntroRoot>
        <div data-test-community="" />
      </LaunchIntroRoot>
    );
  });
  return owner;
}

const overlay = () => document.querySelector("[data-launch-intro-overlay]");

beforeEach(() => {
  vi.resetModules();
  h.hide.mockClear();
  h.replace.mockClear();
  h.markEpoch.mockClear();
  h.abort.mockClear();
  h.releaseDeferral.mockClear();
  h.intent.mockReset();
  h.ctaPath = "/philife/abc";
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
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

describe("IN-S11 · D-16 — 준비 중 예상 밖 예외", () => {
  it("예외 → 커뮤니티로 넘김 1회(prepare_exception) · 인트로 렌더 0 · 커뮤니티 첫 화면에서 시작 화면 닫힘 1회", async () => {
    h.intent.mockImplementation(() => Promise.reject(new Error("boom")));
    const owner = await mount();
    await act(async () => flush());

    expect(h.abort).toHaveBeenCalledTimes(1);
    expect(h.abort).toHaveBeenCalledWith("prepare_exception");
    expect(owner.getLaunchOsReleaseOwner()).toBe("community");
    expect(h.markEpoch).toHaveBeenCalledWith("epoch-1");
    expect(overlay()).toBeNull();
    expect(h.hide).not.toHaveBeenCalled();

    // 커뮤니티 첫 화면이 그려짐(여러 번) → 시작 화면은 1번만 닫힌다
    const metrics = await import("@/lib/startup/startup-metrics");
    metrics.markInitialDestinationVisualReady();
    metrics.markInitialDestinationVisualReady();
    await act(async () => flush());
    expect(h.hide).toHaveBeenCalledTimes(1);
    expect(owner.isLaunchOsReleased()).toBe(true);
    expect(metrics.getDibayBootMetrics().splashDismissReason).toBe("initialDestinationVisualReady");
  });
});

describe("IN-S10 · D-17 — preparing 중 백그라운드", () => {
  it("hidden → 준비 중단 · 커뮤니티로 넘김 · 같은 epoch 표시 · 준비가 늦게 끝나도 인트로 렌더 0", async () => {
    let resolveIntent!: (v: string | null) => void;
    h.intent.mockImplementation(() => new Promise((r) => (resolveIntent = r)));
    const owner = await mount();
    await act(async () => flush());
    expect(h.abort).not.toHaveBeenCalled();

    visibility = "hidden";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(h.abort).toHaveBeenCalledTimes(1);
    expect(h.abort).toHaveBeenCalledWith("background_preparing");
    expect(h.markEpoch).toHaveBeenCalledWith("epoch-1");
    expect(owner.getLaunchOsReleaseOwner()).toBe("community");

    // 돌아옴 + 준비가 늦게 끝남 → 인트로는 나오지 않고 OS 해제도 인트로가 하지 않는다
    visibility = "visible";
    await act(async () => {
      resolveIntent(null);
      await flush();
    });
    expect(overlay()).toBeNull();
    expect(h.abort).toHaveBeenCalledTimes(1);
    expect(h.hide).not.toHaveBeenCalled();

    const metrics = await import("@/lib/startup/startup-metrics");
    metrics.markInitialDestinationVisualReady();
    await act(async () => flush());
    expect(h.hide).toHaveBeenCalledTimes(1);
  });
});

describe("DS-8 — CTA 이동 후 오버레이 닫힘", () => {
  async function showIntro() {
    h.intent.mockResolvedValue(null);
    const owner = await mount();
    await act(async () => flush(20));
    expect(overlay()).not.toBeNull();
    // 인트로 첫 프레임 → OS 해제 1회
    expect(h.hide).toHaveBeenCalledTimes(1);
    return owner;
  }

  it("목표 주소가 다른 주소(/login)로 넘어가도 이동 뒤 그려진 화면에서 exiting 오버레이가 닫힌다", async () => {
    const owner = await showIntro();
    await act(async () => {
      (document.querySelector("[data-test-cta]") as HTMLButtonElement).click();
    });
    expect(h.replace).toHaveBeenCalledWith("/philife/abc");
    expect(overlay()?.getAttribute("data-launch-intro-phase")).toBe("exiting");

    const start = window.location.pathname;
    // 이동 전 시작 주소 화면 → 아직 닫지 않음(빈 화면·중간 화면 노출 방지)
    await act(async () => owner.noteDestinationShellFrame(start));
    expect(overlay()).not.toBeNull();
    // 목표가 로그인으로 넘어감 → 그 화면이 그려지면 닫힘
    await act(async () => owner.noteDestinationShellFrame("/login"));
    expect(overlay()).toBeNull();
    expect(h.hide).toHaveBeenCalledTimes(1);
  });

  it("목표 주소 그대로 도착해도 닫힌다", async () => {
    const owner = await showIntro();
    await act(async () => {
      (document.querySelector("[data-test-cta]") as HTMLButtonElement).click();
    });
    await act(async () => owner.noteDestinationShellFrame("/philife/abc"));
    expect(overlay()).toBeNull();
  });

  it("옛 게시본 CTA 가 회원 금지 경로(/admin)면 이동하지 않고 건너뛰기처럼 닫는다", async () => {
    h.ctaPath = "/admin/users";
    const owner = await showIntro();
    await act(async () => {
      (document.querySelector("[data-test-cta]") as HTMLButtonElement).click();
    });
    expect(h.replace).not.toHaveBeenCalled();
    await act(async () => owner.noteDestinationShellFrame(window.location.pathname));
    expect(overlay()).toBeNull();
  });
});
