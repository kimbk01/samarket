import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/**
 * D1 1단계 (Owner 승인 2026-11-19) — 서버는 항상 보내고, 웹 서비스워커는
 * 「보이는 창이 같은 메신저 방」이면 OS 알림을 생략한다. 통화 알림·다른 방·숨긴 창·판정 실패는 표시.
 */
type FakeClient = { url: string; visibilityState: "visible" | "hidden"; postMessage: (m: unknown) => void };

async function runPush(payload: Record<string, unknown>, clientList: FakeClient[], matchAllFails = false) {
  const src = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  const listeners: Record<string, (e: unknown) => void> = {};
  const showNotification = vi.fn(async () => undefined);
  const self = {
    addEventListener: (name: string, fn: (e: unknown) => void) => {
      listeners[name] = fn;
    },
    registration: { showNotification, getNotifications: async () => [] },
  };
  const clients = {
    matchAll: vi.fn(async () => {
      if (matchAllFails) throw new Error("matchAll failed");
      return clientList;
    }),
  };
  runInNewContext(src, { self, clients, URL, console });
  const waits: Promise<unknown>[] = [];
  listeners.push({
    data: { json: () => payload },
    waitUntil: (p: Promise<unknown>) => waits.push(p),
  });
  /** 열린 탭 깨우기(wake)는 matchAll 실패 시 기존대로 reject — 표시 여부만 본다 */
  await Promise.allSettled(waits);
  return showNotification;
}

const messagePayload = {
  notification_type: "community_messenger_message",
  roomId: "room-1",
  title: "A",
  body: "hi",
  url: "/community-messenger/rooms/room-1",
};

const client = (path: string, visibilityState: "visible" | "hidden" = "visible"): FakeClient => ({
  url: `https://samarket.example${path}`,
  visibilityState,
  postMessage: () => {},
});

describe("sw.js message push — same visible room skip (D1)", () => {
  it("visible window on the same room → no OS notification", async () => {
    const show = await runPush(messagePayload, [client("/community-messenger/rooms/room-1")]);
    expect(show).not.toHaveBeenCalled();
  });

  it("visible window on another room → notification shown", async () => {
    const show = await runPush(messagePayload, [client("/community-messenger/rooms/room-2")]);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("same room but hidden tab → notification shown", async () => {
    const show = await runPush(messagePayload, [client("/community-messenger/rooms/room-1", "hidden")]);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("no window → notification shown", async () => {
    const show = await runPush(messagePayload, []);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("clients lookup failure → fail-open (shown)", async () => {
    const show = await runPush(messagePayload, [], true);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("incoming call push is never skipped even if that room is visible", async () => {
    const show = await runPush(
      {
        notification_type: "community_messenger_incoming_call",
        sessionId: "s1",
        roomId: "room-1",
        title: "call",
      },
      [client("/community-messenger/rooms/room-1")]
    );
    expect(show).toHaveBeenCalledTimes(1);
  });
});
