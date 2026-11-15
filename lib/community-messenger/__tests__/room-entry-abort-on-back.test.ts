/**
 * 방 진입 중 뒤로 = 진입 중단 (2026-11-15). 방이 그려지기 전 뒤로 → 목록 사진·로딩 원·우선 모드·잠금·표시 상태·의도 정리.
 * @vitest-environment jsdom
 */
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
  it("방이 그려진 뒤에는 감시 해제 — 뒤로는 방이 처리", () => {
    armRoomEntryAbortOnBack("r3");
    noteRoomEntryArrived("r3");
    window.history.replaceState(null, "", "/community-messenger");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(calls).toEqual([]);
  });
});
