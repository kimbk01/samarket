// @vitest-environment jsdom
/**
 * 그룹 채팅 전체 결함 G2 (docs/design/group-chat-full-fix-design-2026-11-13.md) — 실제로 그려서 확인한다.
 * 옛 Inner 는 렌더 본문에서 매번 begin → 첫 paint 후 끄면(note → phase1 구독 재렌더) 다시 켜져 끝까지 경량 모드.
 * - 첫 렌더에서만 첫 패스가 켜져 있다
 * - 첫 커밋 뒤 꺼지고, 끄기 알림으로 다시 렌더돼도 다시 켜지지 않는다
 * - shell paint 경로가 먼저 끝냈어도 Inner 첫 렌더는 첫 패스로 돈다(예전과 같은 첫 렌더)
 * - 같은 방을 다시 마운트(재진입)하면 다시 첫 렌더 1회 켜진다
 */
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  beginCmRoomEntryShellFirstPass,
  isCmRoomEntryShellFirstPass,
  noteCmRoomEntryShellFirstPaint,
  resetCmRoomEntryShellFirstPassForTests,
  subscribeCmRoomEntryShellFirstPass,
  useCmRoomEntryShellFirstPassForRoom,
} from "@/lib/community-messenger/room/cm-room-entry-shell-first-pass";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Inner 와 같은 순서: 훅 → phase1 처럼 「첫 패스 끝」 구독으로 다시 렌더 → 렌더마다 표시 기록 */
function Harness({ roomId, seen }: { roomId: string; seen: boolean[] }) {
  useCmRoomEntryShellFirstPassForRoom(roomId);
  const [, bump] = useState(0);
  useEffect(() => subscribeCmRoomEntryShellFirstPass(() => bump((n) => n + 1)), []);
  seen.push(isCmRoomEntryShellFirstPass());
  return null;
}

describe("room entry shell first pass — first render only (G2)", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetCmRoomEntryShellFirstPassForTests();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    resetCmRoomEntryShellFirstPassForTests();
  });

  it("첫 렌더만 켜지고, 첫 커밋 뒤 꺼진 채 다시 렌더돼도 다시 켜지지 않는다", () => {
    const seen: boolean[] = [];
    act(() => root.render(<Harness roomId="room-a" seen={seen} />));
    expect(seen[0]).toBe(true);
    expect(isCmRoomEntryShellFirstPass()).toBe(false);
    // 다른 이유로 여러 번 다시 렌더 (phase1 상태 변경과 같음)
    act(() => root.render(<Harness roomId="room-a" seen={seen} />));
    act(() => root.render(<Harness roomId="room-a" seen={seen} />));
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.slice(1).every((v) => v === false)).toBe(true);
    expect(isCmRoomEntryShellFirstPass()).toBe(false);
  });

  it("shell paint 경로가 먼저 begin+note 해도 Inner 첫 렌더는 첫 패스, 그 뒤 꺼짐", () => {
    beginCmRoomEntryShellFirstPass("room-b");
    noteCmRoomEntryShellFirstPaint("room-b");
    expect(isCmRoomEntryShellFirstPass()).toBe(false);
    const seen: boolean[] = [];
    act(() => root.render(<Harness roomId="room-b" seen={seen} />));
    expect(seen[0]).toBe(true);
    expect(isCmRoomEntryShellFirstPass()).toBe(false);
    act(() => root.render(<Harness roomId="room-b" seen={seen} />));
    expect(seen[seen.length - 1]).toBe(false);
  });

  it("같은 방 재진입(다시 마운트)은 다시 첫 렌더 1회 켜진다", () => {
    const first: boolean[] = [];
    act(() => root.render(<Harness key="m1" roomId="room-c" seen={first} />));
    act(() => root.render(<div />));
    const second: boolean[] = [];
    act(() => root.render(<Harness key="m2" roomId="room-c" seen={second} />));
    expect(first[0]).toBe(true);
    expect(second[0]).toBe(true);
    expect(isCmRoomEntryShellFirstPass()).toBe(false);
  });

  it("방이 바뀌면 새 방의 첫 렌더 1회 켜진다", () => {
    const seen: boolean[] = [];
    act(() => root.render(<Harness roomId="room-d" seen={seen} />));
    const before = seen.length;
    act(() => root.render(<Harness roomId="room-e" seen={seen} />));
    expect(seen[before]).toBe(true);
    expect(isCmRoomEntryShellFirstPass()).toBe(false);
  });
});
