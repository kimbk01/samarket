// @vitest-environment jsdom
/**
 * 감사 2026-11-26 §10 (docs/audit/os-cover-push-entry-delay-audit-2026-11-26.md) — 단일 규칙:
 * OS 화면이 아직 떠 있는 동안 붙거나 이동한 앱 시작 목적지는 진입 움직임 없이 제자리에 그린다.
 * 실기(Samsung, 11-26): 알림·복원 진입 5/5회 — OS 화면이 걷힌 직후 채팅방이 오른쪽에서 밀려오며 흰 띠 0.1~0.15초.
 */
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = { back: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/community-messenger/rooms/room-1",
}));
vi.mock("@/hooks/use-is-messenger-split-viewport", () => ({ useIsMessengerSplitViewport: () => false }));
vi.mock("@/lib/community-messenger/room/messenger-room-entry-origin-store", () => ({
  resolveMessengerRoomEntryOrigin: () => "push",
}));
/** 목록 복사본(앱 안 목록 탭에서만 생김) 유무 — 셸 진입 움직임의 유일한 조건(§13) */
const entrySnapshot = { present: false };
vi.mock("@/lib/community-messenger/room/messenger-page-snapshot-transition", () => ({
  hasMessengerRoomEntrySnapshot: () => entrySnapshot.present,
  dismissMessengerRoomEntrySnapshot: () => {
    entrySnapshot.present = false;
  },
  revealMessengerRoomEntrySnapshot: () => {},
  runMessengerRoomExitWithSnapshot: () => false,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
  );
  window.history.replaceState(null, "", "/community-messenger/rooms/room-1");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mountShell(osReleased: boolean, listSnapshotBehind = false) {
  entrySnapshot.present = listSnapshotBehind;
  const owner = await import("@/lib/launch-intro/os-release-owner");
  if (osReleased) owner.noteLaunchOsReleased();
  const { MessengerRoomSwipeBackShell } = await import(
    "@/components/community-messenger/room/MessengerRoomSwipeBackShell"
  );
  act(() => {
    root.render(
      <MessengerRoomSwipeBackShell roomId="room-1" roomType="direct">
        <div>body</div>
      </MessengerRoomSwipeBackShell>
    );
  });
  return container.querySelector("[data-messenger-room-animation-phase]") as HTMLElement;
}

describe("isLaunchEntryMotionSuppressed", () => {
  it("OS 화면 유지 중 → 움직임 끔 · 해제 뒤 → 그대로 · 통화 화면 경로는 항상 제외", async () => {
    const owner = await import("@/lib/launch-intro/os-release-owner");
    const { isLaunchEntryMotionSuppressed } = await import("@/components/route-transition/launch-entry-motion");
    expect(isLaunchEntryMotionSuppressed("/philife")).toBe(true);
    expect(isLaunchEntryMotionSuppressed("/community-messenger/rooms/room-1")).toBe(true);
    expect(isLaunchEntryMotionSuppressed("/community-messenger/calls/abc")).toBe(false);
    owner.noteLaunchOsReleased();
    expect(isLaunchEntryMotionSuppressed("/philife")).toBe(false);
  });
});

describe("채팅방 셸 — 진입 움직임은 뒤에 목록 복사본이 있을 때만 (§13)", () => {
  it("OS 화면이 떠 있을 때 붙으면(복사본 없음) 움직임 없이 제자리(idle)", async () => {
    const surface = await mountShell(false);
    expect(surface.dataset.messengerRoomAnimationPhase).toBe("idle");
    expect(surface.className).not.toContain("messenger-enter");
  });

  it("실기 17:55 재현: OS 화면이 먼저 걷힌 뒤 붙어도 복사본이 없으면(알림·복원) 제자리 — 흰 띠 없음", async () => {
    const surface = await mountShell(true, false);
    expect(surface.dataset.messengerRoomAnimationPhase).toBe("idle");
    expect(surface.className).not.toContain("messenger-enter");
  });

  it("앱 안 목록 탭(복사본 있음)이면 기존대로 오른쪽→왼쪽 진입", async () => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const surface = await mountShell(true, true);
    expect(surface.dataset.messengerRoomAnimationPhase).toBe("enter");
  });
});

describe("메인 화면 이동 — 시작 목적지 (구조 계약)", () => {
  it("방향 계산: OS 화면 유지 중 경로 변경은 none", () => {
    const src = readFileSync("components/route-transition/useRouteTransitionDirection.ts", "utf8");
    expect(src).toMatch(/if \(isLaunchEntryMotionSuppressed\(pathKey\)\) \{\s*kindRef\.current = "none";\s*return;/);
  });

  it("AppRouteTransition: 경로 변경 분기 맨 앞에서 허브 대체 슬라이드 포함 모든 움직임 없이 교체", () => {
    const src = readFileSync("components/route-transition/AppRouteTransition.tsx", "utf8");
    const branch = src.indexOf("if (prev != null && prev.pathname !== pathKey) {");
    const guard = src.indexOf("if (isLaunchEntryMotionSuppressed(pathKey)) {", branch);
    const kind = src.indexOf("const kind: RouteTransitionEnterKind = kindRef.current;", branch);
    const hubSlide = src.indexOf("beginHubFallbackEnter(el, hubAxis, pathKey)", branch);
    expect(branch).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(branch);
    expect(guard).toBeLessThan(kind);
    expect(guard).toBeLessThan(hubSlide);
    expect(src.slice(guard, kind)).toContain("return undefined;");
  });
});
