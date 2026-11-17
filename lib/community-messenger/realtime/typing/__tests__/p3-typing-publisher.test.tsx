// @vitest-environment jsdom
/**
 * P3 입력 중 발신 (Owner 2026-11-18 레거시 Telegram 기준) — 5초 재전송·포커스+보임 조건·blur/숨김/pagehide/전송/언마운트 stop.
 */
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { event: string; topic: string }[] = [];
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({}) }));
vi.mock("@/lib/community-messenger/realtime/private-broadcast-client", () => ({
  sendMessengerPrivateBroadcastFromClient: (args: { event: string; topic: string }) => {
    sent.push({ event: args.event, topic: args.topic });
    return Promise.resolve({ ok: true });
  },
  createMessengerPrivateChannelStatusHandler: () => () => {},
  messengerPrivateBroadcastChannelOptions: () => ({ config: { private: true, broadcast: { ack: false, self: false } } }),
  primeMessengerPrivateRealtimeAuth: () => {},
}));

import { useCommunityMessengerRoomTypingPublisher } from "@/lib/community-messenger/realtime/typing/use-community-messenger-room-typing";

let draftSetter: ((v: string) => void) | null = null;
let textarea: HTMLTextAreaElement | null = null;

function Harness({ roomId, draft }: { roomId: string; draft: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useCommunityMessengerRoomTypingPublisher({ roomId, viewerUserId: "me", draft, inputRef: ref });
  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        textarea = el;
      }}
      defaultValue=""
    />
  );
}

let root: Root;
let host: HTMLDivElement;
let current = { roomId: "room-1", draft: "" };
function render() {
  act(() => root.render(<Harness roomId={current.roomId} draft={current.draft} />));
}
const starts = () => sent.filter((s) => s.event === "typing:start").length;
const stops = () => sent.filter((s) => s.event === "typing:stop").length;

beforeEach(() => {
  vi.useFakeTimers();
  sent.length = 0;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  current = { roomId: "room-1", draft: "" };
  render();
  draftSetter = (v) => {
    current = { ...current, draft: v };
    render();
  };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("useCommunityMessengerRoomTypingPublisher (P3)", () => {
  it("포커스 + 보임에서 11초 연속 입력 → 5초마다 재전송(3회), 2.6초 무입력 후 stop 1회", () => {
    act(() => textarea!.focus());
    for (let i = 1; i <= 11; i += 1) {
      draftSetter!("a".repeat(i));
      act(() => vi.advanceTimersByTime(1_000));
    }
    expect(starts()).toBe(3); // 0s, 5s, 10s
    expect(stops()).toBe(0);
    act(() => vi.advanceTimersByTime(2_700));
    expect(stops()).toBe(1);
  });

  it("포커스 없음(저장 초안 복원) → 보내지 않음", () => {
    draftSetter!("restored draft");
    act(() => vi.advanceTimersByTime(3_000));
    expect(sent).toHaveLength(0);
  });

  it("blur → stop 1회", () => {
    act(() => textarea!.focus());
    draftSetter!("hi");
    act(() => textarea!.blur());
    expect(starts()).toBe(1);
    expect(stops()).toBe(1);
  });

  it("화면 숨김 → stop, pagehide → stop", () => {
    act(() => textarea!.focus());
    draftSetter!("hi");
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(stops()).toBe(1);
    vis.mockReturnValue("visible");
    draftSetter!("hi2");
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(stops()).toBe(2);
    vis.mockRestore();
  });

  it("전송(초안 비움) → stop 1회, 방 나감(언마운트) → 보낸 상태면 stop", () => {
    act(() => textarea!.focus());
    draftSetter!("hello");
    draftSetter!("");
    expect(stops()).toBe(1);
    draftSetter!("again");
    expect(starts()).toBe(2);
    act(() => root.unmount());
    expect(stops()).toBe(2);
    root = createRoot(host);
    render();
  });
});
