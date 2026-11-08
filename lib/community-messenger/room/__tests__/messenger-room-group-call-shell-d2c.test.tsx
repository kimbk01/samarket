// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let hookValue: Record<string, unknown> = {};
let hookRenders = 0;
vi.mock("@/lib/community-messenger/use-community-messenger-group-call", () => ({
  useCommunityMessengerGroupCall: () => {
    hookRenders += 1;
    return { ...hookValue };
  },
}));

import { MessengerRoomGroupCallShell } from "@/lib/community-messenger/room/MessengerRoomGroupCallShell";
import { isSameGroupCallHandle } from "@/lib/community-messenger/room/CommunityMessengerGroupCallProviderBridge";
import {
  DIRECT_ROOM_GROUP_CALL_STUB,
  useCommunityMessengerRoomGroupCall,
} from "@/lib/community-messenger/room/community-messenger-group-call-context";

const deps = {
  enabled: true,
  roomId: "r1",
  viewerUserId: "u1",
  roomLabel: "g",
  activeCall: null,
  onRefresh: () => {},
};

let mounts = 0;
let lastSeen: unknown = null;
function RoomScreen() {
  const call = useCommunityMessengerRoomGroupCall();
  useEffect(() => {
    lastSeen = call;
  });
  useEffect(() => {
    mounts += 1;
  }, []);
  return <div data-room-screen="" />;
}

async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("D2-다 그룹 통화 셸 — 트리 모양 고정(방 화면 재생성 없음)", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    mounts = 0;
    hookRenders = 0;
    lastSeen = null;
    hookValue = { panel: null, busy: null, elapsedSeconds: 0 };
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("그룹방: 모듈을 불러온 뒤에도 방 화면 요소가 그대로이고(재마운트 0) 훅 값이 전달된다", async () => {
    act(() =>
      root.render(
        <MessengerRoomGroupCallShell isGroupRoom bridgeDeps={deps}>
          <RoomScreen />
        </MessengerRoomGroupCallShell>
      )
    );
    const before = host.querySelector("[data-room-screen]");
    expect(lastSeen).toBe(DIRECT_ROOM_GROUP_CALL_STUB);
    await flush();
    const after = host.querySelector("[data-room-screen]");
    expect(after).toBe(before);
    expect(mounts).toBe(1);
    expect(lastSeen).not.toBe(DIRECT_ROOM_GROUP_CALL_STUB);
    expect((lastSeen as { elapsedSeconds: number }).elapsedSeconds).toBe(0);
    /** 값 올림 ↔ 셸 렌더 반복 없음 */
    expect(hookRenders).toBeLessThanOrEqual(2);
  });

  it("1:1 방: 임시 값 그대로, 훅 실행 없음", async () => {
    act(() =>
      root.render(
        <MessengerRoomGroupCallShell isGroupRoom={false} bridgeDeps={deps}>
          <RoomScreen />
        </MessengerRoomGroupCallShell>
      )
    );
    await flush();
    expect(lastSeen).toBe(DIRECT_ROOM_GROUP_CALL_STUB);
    expect(hookRenders).toBe(0);
    expect(mounts).toBe(1);
  });

  it("그룹 → 1:1 로 바뀌면 임시 값으로 돌아가고 방 화면은 재마운트되지 않는다", async () => {
    act(() =>
      root.render(
        <MessengerRoomGroupCallShell isGroupRoom bridgeDeps={deps}>
          <RoomScreen />
        </MessengerRoomGroupCallShell>
      )
    );
    await flush();
    expect(lastSeen).not.toBe(DIRECT_ROOM_GROUP_CALL_STUB);
    act(() =>
      root.render(
        <MessengerRoomGroupCallShell isGroupRoom={false} bridgeDeps={deps}>
          <RoomScreen />
        </MessengerRoomGroupCallShell>
      )
    );
    await flush();
    expect(lastSeen).toBe(DIRECT_ROOM_GROUP_CALL_STUB);
    expect(mounts).toBe(1);
  });

  it("isSameGroupCallHandle: 필드 단위 비교", () => {
    const fn = () => {};
    const a = { panel: null, busy: null, startOutgoingCall: fn } as never;
    const b = { panel: null, busy: null, startOutgoingCall: fn } as never;
    const c = { panel: null, busy: "call-start", startOutgoingCall: fn } as never;
    expect(isSameGroupCallHandle(a, b)).toBe(true);
    expect(isSameGroupCallHandle(a, c)).toBe(false);
    expect(isSameGroupCallHandle(null, a)).toBe(false);
  });
});
