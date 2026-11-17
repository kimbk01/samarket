// @vitest-environment jsdom
/**
 * P5 (부록 P5 §B2·§B7) — 방 진입 출처: Navigation key 저장 · reload 모사 · 상한 50 · Navigation API 없음 폴백.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Entry = { key: string; index: number };

function installNavigation(entries: Entry[], cur: number) {
  const nav = {
    get currentEntry() {
      return entries[cur] ?? null;
    },
    entries: () => entries.slice(),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (window as unknown as { navigation: unknown }).navigation = nav;
}

async function load() {
  const store = await import("@/lib/community-messenger/room/messenger-room-entry-origin-store");
  const push = await import("@/lib/push/push-navigation-back");
  return { store, push };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/community-messenger/rooms/B");
});
afterEach(() => {
  vi.resetModules();
  delete (window as unknown as { navigation?: unknown }).navigation;
  window.sessionStorage.clear();
});

describe("진입 출처 판정", () => {
  it("콜드 푸시: [/ (알림으로 떠남), 방] → push", async () => {
    installNavigation([{ key: "k0", index: 0 }, { key: "k1", index: 1 }], 0);
    const { store, push } = await load();
    push.markLeavingByPushNavigation(); // k0 표시
    installNavigation([{ key: "k0", index: 0 }, { key: "k1", index: 1 }], 1);
    expect(store.resolveMessengerRoomEntryOrigin()).toBe("push");
  });

  it("앱 안 이동: 직전 항목 표시 없음 → in_app", async () => {
    installNavigation([{ key: "k0", index: 0 }, { key: "k1", index: 1 }], 1);
    const { store } = await load();
    expect(store.resolveMessengerRoomEntryOrigin()).toBe("in_app");
  });

  it("첫 기록이 방(App Link·복원) → first_entry", async () => {
    installNavigation([{ key: "k0", index: 0 }], 0);
    const { store } = await load();
    expect(store.resolveMessengerRoomEntryOrigin()).toBe("first_entry");
  });

  it("reload 모사(모듈 재import) 뒤에도 push 유지 — 알림 표시·판정 모두 sessionStorage", async () => {
    installNavigation([{ key: "k0", index: 0 }, { key: "k1", index: 1 }], 0);
    let m = await load();
    m.push.markLeavingByPushNavigation();
    installNavigation([{ key: "k0", index: 0 }, { key: "k1", index: 1 }], 1);
    expect(m.store.resolveMessengerRoomEntryOrigin()).toBe("push");
    vi.resetModules();
    m = await load();
    expect(m.store.resolveMessengerRoomEntryOrigin()).toBe("push");
    // 저장 기록이 지워져도 알림 표시(sessionStorage)로 같은 판정
    m.store.__resetMessengerRoomEntryOriginForTests();
    expect(m.store.resolveMessengerRoomEntryOrigin()).toBe("push");
  });

  it("replace 로 같은 key 의 다른 경로(목록)가 되면 저장 판정을 쓰지 않는다", async () => {
    installNavigation([{ key: "k0", index: 0 }, { key: "k1", index: 1 }], 1);
    const { store } = await load();
    expect(store.resolveMessengerRoomEntryOrigin()).toBe("in_app");
    window.history.replaceState(null, "", "/community-messenger/rooms/C");
    installNavigation([{ key: "k0", index: 0 }, { key: "k1", index: 1 }], 1);
    const raw = JSON.parse(window.sessionStorage.getItem(store.MESSENGER_ROOM_ENTRY_ORIGIN_STORAGE_KEY) ?? "[]");
    expect(raw).toHaveLength(1);
    expect(store.resolveMessengerRoomEntryOrigin()).toBe("in_app");
    const raw2 = JSON.parse(window.sessionStorage.getItem(store.MESSENGER_ROOM_ENTRY_ORIGIN_STORAGE_KEY) ?? "[]");
    expect(raw2).toEqual([{ slot: "k1", path: "/community-messenger/rooms/C", origin: "in_app" }]);
  });

  it("방 경로가 아니면 저장하지 않는다", async () => {
    window.history.replaceState(null, "", "/community-messenger");
    installNavigation([{ key: "k0", index: 0 }], 0);
    const { store } = await load();
    store.resolveMessengerRoomEntryOrigin();
    expect(window.sessionStorage.getItem(store.MESSENGER_ROOM_ENTRY_ORIGIN_STORAGE_KEY)).toBeNull();
  });

  it("상한 50", async () => {
    const { store } = await load();
    for (let i = 0; i < 60; i += 1) {
      installNavigation([{ key: "a", index: 0 }, { key: `k${i}`, index: 1 }], 1);
      store.resolveMessengerRoomEntryOrigin();
    }
    const raw = JSON.parse(window.sessionStorage.getItem(store.MESSENGER_ROOM_ENTRY_ORIGIN_STORAGE_KEY) ?? "[]");
    expect(raw).toHaveLength(store.MESSENGER_ROOM_ENTRY_ORIGIN_MAX);
    expect(raw[raw.length - 1].slot).toBe("k59");
  });

  it("Navigation API 없음: history.length 1 → first_entry, 그 밖 → in_app", async () => {
    const { store } = await load();
    const spy = vi.spyOn(window.history, "length", "get").mockReturnValue(1);
    expect(store.resolveMessengerRoomEntryOrigin()).toBe("first_entry");
    spy.mockReturnValue(3);
    expect(store.resolveMessengerRoomEntryOrigin()).toBe("in_app");
    spy.mockRestore();
  });
});
