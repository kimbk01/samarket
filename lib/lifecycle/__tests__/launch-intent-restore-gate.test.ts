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
