/**
 * 방 진입 중 뒤로 = 진입 중단 (2026-11-15). 방이 그려지기 전 뒤로 → 목록 사진·로딩 원·우선 모드·잠금·표시 상태·의도 정리.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("@/lib/community-messenger/room/messenger-page-snapshot-transition", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  dismissMessengerRoomEntrySnapshot: () => void calls.push("snapshot"),
}));
vi.mock("@/lib/community-messenger/room/cm-room-entry-priority-mode", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  endCmRoomEntryPriorityMode: (r: string) => void calls.push(`priority:${r}`),
}));
vi.mock("@/lib/navigation/cm-deep-route-navigation-lock", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  clearDeepRouteNavigationLock: () => void calls.push("lock"),
}));
vi.mock("@/lib/community-messenger/room/cm-room-opening-overlay-store", async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return {
    ...actual,
    useCmRoomOpeningOverlayStore: { getState: () => ({ reset: () => void calls.push("overlay") }) },
  };
});
vi.mock("@/lib/community-messenger/room/messenger-room-entry-intent", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  clearRoomEntryIntent: (id: string) => void calls.push(`intent:${id}`),
}));

import {
  armRoomEntryAbortOnBack,
  noteRoomEntryArrived,
} from "@/lib/community-messenger/community-messenger-room-forward-navigation";

beforeEach(() => {
  calls.length = 0;
  window.history.replaceState(null, "", "/community-messenger");
});

describe("방 진입 중 뒤로", () => {
  it("방 도착 전 뒤로(다른 주소) → 진입 정리 전부", () => {
    armRoomEntryAbortOnBack("r1");
    window.history.replaceState(null, "", "/community-messenger");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(calls).toEqual(["snapshot", "priority:entry_aborted", "lock", "overlay", "intent:r1"]);
  });
  it("방 주소로의 popstate 는 진입 계속", () => {
    armRoomEntryAbortOnBack("r2");
    window.history.replaceState(null, "", "/community-messenger/rooms/r2");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(calls).toEqual([]);
  });
  it("방 진입이 끝난 뒤에는 감시 해제", () => {
    armRoomEntryAbortOnBack("r3");
    noteRoomEntryArrived("r3");
    window.history.replaceState(null, "", "/community-messenger");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(calls).toEqual([]);
  });
  it("방이 마운트돼도 진입이 끝나기 전에는 감시 유지 — 해제는 들어오는 움직임 완료 타이머·분할/축소 모션에서만 (Xiaomi 계측 2026-11-15)", () => {
    const src = readFileSync(
      path.join(process.cwd(), "components/community-messenger/room/MessengerRoomSwipeBackShell.tsx"),
      "utf8"
    );
    const calls = src.split("noteRoomEntryArrived(rid)").length - 1;
    expect(calls).toBe(2);
    expect(src).toMatch(/setPhase\(\(p\) => \(p === "enter-active" \? "idle" : p\)\);\s*const rid = roomId\?\.trim\(\);\s*if \(rid\) noteRoomEntryArrived\(rid\);/);
    // 감사 11-26 §10: 움직임 없이 여는 경우(분할·축소 모션·앱 시작 목적지)는 즉시 진입 완료
    expect(src).toContain("const skipEnterMotion = splitPaneMode || reducedMotion || launchDestinationEntry;");
    expect(src).toMatch(/if \(rid && skipEnterMotion\) noteRoomEntryArrived\(rid\);/);
  });
});
