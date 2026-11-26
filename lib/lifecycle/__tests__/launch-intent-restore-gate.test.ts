// @vitest-environment jsdom
/**
 * Lifecycle SSOT §8 — 앱 종료 후 푸시 탭으로 시작할 때 직전 화면 복원이 먼저 보이지 않게 (재감사 2026-11-01).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPendingPushRoute = vi.fn<() => Promise<{ path?: string }>>();
const getLaunchUrl = vi.fn<() => Promise<{ url?: string } | undefined>>();

vi.mock("@capacitor/core", () => ({
  registerPlugin: (name: string) =>
    name === "NativeIncomingCall" ? { getPendingPushRoute } : name === "App" ? { getLaunchUrl } : {},
}));

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("hasLaunchIntent", () => {
  beforeEach(async () => {
    vi.resetModules();
    getPendingPushRoute.mockReset();
    getLaunchUrl.mockReset();
    getLaunchUrl.mockResolvedValue(undefined);
  });

  it("native pending push route (Android cold start) → intent", async () => {
    getPendingPushRoute.mockResolvedValue({ path: "/notifications/555902d4" });
    const m = await import("@/lib/lifecycle/launch-intent.client");
    expect(await m.hasLaunchIntent()).toBe("push_route");
  });

  it("no pending route / method missing on old binaries → no intent (normal restore keeps working)", async () => {
    getPendingPushRoute.mockResolvedValue({});
    let m = await import("@/lib/lifecycle/launch-intent.client");
    expect(await m.hasLaunchIntent()).toBeNull();
    vi.resetModules();
    getPendingPushRoute.mockRejectedValue(new Error("not implemented"));
    m = await import("@/lib/lifecycle/launch-intent.client");
    expect(await m.hasLaunchIntent()).toBeNull();
  });

  it("call routes are not an intent for restore (call rules) but still abort the intro as before", async () => {
    getPendingPushRoute.mockResolvedValue({ path: "/community-messenger/calls/s1" });
    const m = await import("@/lib/lifecycle/launch-intent.client");
    expect(await m.hasLaunchIntent()).toBeNull();
    expect(await m.hasLaunchIntent({ includeCallRoutes: true })).toBe("push_route");
  });

  it("push tap already navigated in this document (iOS event first) → intent; call paths never marked", async () => {
    getPendingPushRoute.mockRejectedValue(new Error("not implemented"));
    const m = await import("@/lib/lifecycle/launch-intent.client");
    m.markPushLaunchIntentNavigated("/community-messenger/calls/s1");
    expect(m.readPushLaunchIntentNavigated()).toBeNull();
    m.markPushLaunchIntentNavigated("/notifications/abc");
    expect(await m.hasLaunchIntent()).toBe("push_navigated");
  });
});

describe("F1 재감사 11-26 — 확인을 차례로 기다리지 않는다 (의미 동일)", () => {
  beforeEach(() => {
    vi.resetModules();
    getPendingPushRoute.mockReset();
    getLaunchUrl.mockReset();
    getLaunchUrl.mockResolvedValue(undefined);
    delete (window as unknown as { DibayBootBridge?: unknown }).DibayBootBridge;
  });

  it("Android 동기 브리지가 있으면 복원 판정은 알림 목적지를 네이티브에 다시 묻지 않는다 — 목적지 있음", async () => {
    (window as unknown as { DibayBootBridge: unknown }).DibayBootBridge = { pendingLaunchRoutePath: () => "/notifications/1" };
    const m = await import("@/lib/lifecycle/launch-intent.client");
    expect(await m.hasLaunchIntent()).toBe("push_route");
    expect(getPendingPushRoute).not.toHaveBeenCalled();
  });

  it("Android 동기 브리지 · 목적지 없음 → 딥링크만 확인", async () => {
    (window as unknown as { DibayBootBridge: unknown }).DibayBootBridge = { pendingLaunchRoutePath: () => "" };
    getLaunchUrl.mockResolvedValue({ url: "https://samarket.vercel.app/stores/1" });
    const m = await import("@/lib/lifecycle/launch-intent.client");
    expect(await m.hasLaunchIntent()).toBe("launch_url");
    expect(getPendingPushRoute).not.toHaveBeenCalled();
  });

  it("인트로용(통화 포함)은 동기 브리지가 있어도 네이티브에 묻는다(동기 값은 통화 경로를 뺌)", async () => {
    (window as unknown as { DibayBootBridge: unknown }).DibayBootBridge = { pendingLaunchRoutePath: () => "" };
    getPendingPushRoute.mockResolvedValue({ path: "/community-messenger/calls/s1" });
    const m = await import("@/lib/lifecycle/launch-intent.client");
    expect(await m.hasLaunchIntent({ includeCallRoutes: true })).toBe("push_route");
  });

  it("두 확인은 동시에 나간다 — 알림 확인이 끝나기 전에 딥링크 확인이 시작", async () => {
    let resolvePush: (v: { path?: string }) => void = () => {};
    getPendingPushRoute.mockReturnValue(new Promise((r) => (resolvePush = r)));
    const m = await import("@/lib/lifecycle/launch-intent.client");
    const p = m.hasLaunchIntent();
    await new Promise((r) => setTimeout(r, 0));
    expect(getLaunchUrl).toHaveBeenCalledTimes(1);
    resolvePush({});
    expect(await p).toBeNull();
  });

  it("우선순위 그대로: 알림 목적지와 딥링크가 둘 다 있으면 알림", async () => {
    getPendingPushRoute.mockResolvedValue({ path: "/notifications/1" });
    getLaunchUrl.mockResolvedValue({ url: "https://samarket.vercel.app/stores/1" });
    const m = await import("@/lib/lifecycle/launch-intent.client");
    expect(await m.hasLaunchIntent()).toBe("push_route");
  });

  it("H2-3 상한: 네이티브가 응답하지 않으면 8초 뒤 「의도 없음」(기존 조회 불가 동작)", async () => {
    vi.useFakeTimers();
    try {
      getPendingPushRoute.mockReturnValue(new Promise(() => {}));
      getLaunchUrl.mockReturnValue(new Promise(() => {}));
      const m = await import("@/lib/lifecycle/launch-intent.client");
      const p = m.hasLaunchIntent();
      await vi.advanceTimersByTimeAsync(m.LAUNCH_INTENT_CHECK_CAP_MS);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("restore gate wiring", () => {
  it("LifecycleRouteEffects checks the launch intent before restore / Safe Entry and never overrides a later move", () => {
    const src = read("lib/lifecycle/lifecycle-route-effects.client.ts");
    expect(src).toContain("void hasLaunchIntent().then((intent) => {");
    expect(src).toContain("reason=launch_intent:");
    expect(src).toContain("reason=moved path=");
    expect(src).not.toMatch(/setTimeout\(/);
  });

  it("PushRouteListener marks the push destination; intro reuses the same intent check", () => {
    expect(read("components/push/PushRouteListener.tsx")).toContain("markPushLaunchIntentNavigated(path);");
    expect(read("components/launch-intro/LaunchIntroRoot.tsx")).toContain(
      "await hasLaunchIntent({ includeCallRoutes: true })"
    );
  });
});
