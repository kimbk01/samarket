// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readMessengerSplitRoomEntryFrameSeed,
  readMessengerSplitRoomEntryFrameSeedRaw,
} from "@/lib/community-messenger/room/messenger-split-room-entry-frame-seed";
import { markRoomEntryIntent } from "@/lib/community-messenger/room/messenger-room-entry-intent";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * 분할 화면 방 진입 깜빡임 P1·P2 (2026-11-07) — 원인: loading 이 아무것도 안 그려 흰 빈 칸,
 * 대기 화면이 칸 전체를 덮었다가 방으로 교체. 같은 틀 하나를 두 곳(loading·대기)에서 그린다.
 */
describe("messenger split room entry frame (P1·P2)", () => {
  afterEach(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* node env */
    }
  });

  it("P1 — room loading.tsx keeps the probe and adds the split-only frame", () => {
    const src = read("app/(main)/community-messenger/rooms/[roomId]/loading.tsx");
    expect(src).toContain("<MessengerRoomSegmentLoadingProbe />");
    expect(src).toContain("<MessengerRoomSplitLoadingFrame />");
    const host = read("components/community-messenger/room/MessengerRoomSplitLoadingFrame.tsx");
    expect(host).toMatch(/if \(!isSplit\) return null;/);
  });

  it("P2 — EntryEmpty uses the same frame only when split; mobile spinner shell unchanged", () => {
    const src = read("components/community-messenger/room/CommunityMessengerRoomEntryEmpty.tsx");
    expect(src).toMatch(/if \(isSplit\) \{[\s\S]*<MessengerSplitRoomEntryFrame/);
    expect(src).toContain('data-cm-room-split-entry-wait=""');
    // 휴대폰 경로 — 기존 칸 전체 대기 화면 유지
    expect(src).toContain('data-cm-room-entry-buffering=""');
    expect(src).toContain('className="cm-room-shell flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)]"');
  });

  it("frame header classes match the real Phase2 header (split) — no shift when the room arrives", () => {
    const header = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx");
    const frame = read("components/community-messenger/room/MessengerSplitRoomEntryFrame.tsx");
    expect(header).toContain('"min-w-0 overflow-hidden pt-[var(--safe-top)] pr-[max(12px,var(--safe-right))]"');
    expect(frame).toContain('"min-w-0 overflow-hidden pt-[var(--safe-top)] pr-[max(12px,var(--safe-right))]"');
    const btn = header.match(/CM_ROOM_HEADER_TOUCH_BTN_CLASS =\s*"([^"]+)"/)?.[1];
    const face = header.match(/CM_ROOM_HEADER_TOUCH_FACE_BASE_CLASS =\s*"([^"]+)"/)?.[1];
    expect(btn).toBeTruthy();
    expect(face).toBeTruthy();
    expect(frame).toContain(`const HEADER_TOUCH_BTN_CLASS = "${btn}"`);
    expect(frame).toContain(`const HEADER_TOUCH_FACE_CLASS = "${face}"`);
    // 같은 방 셸 스코프 — 대화 배경·상단바 CSS 를 실제 방과 공유
    expect(frame).toMatch(/data-cm-room\s/);
    expect(frame).toContain('className="cm-room-shell flex min-h-0 flex-1 flex-col overflow-hidden"');
  });

  it("wait indicator appears after a short delay (no blink on fast loads)", () => {
    const css = read("app/messenger-view-transitions.css");
    expect(css).toMatch(
      /\[data-cm-room-split-entry-frame\] \[data-cm-room-split-entry-wait\] \{\s*animation: cm-split-room-entry-wait-in 160ms ease-out 240ms both;/
    );
  });

  it("seed — only general_direct rooms show name/photo; others get an empty header", () => {
    const direct = JSON.stringify({ title: "김선희", avatarUrl: "https://x/a.png", expectedDomain: "general_direct" });
    expect(readMessengerSplitRoomEntryFrameSeed("r1", direct)).toEqual({
      title: "김선희",
      avatarUrl: "https://x/a.png",
    });
    for (const d of ["trade", "store_order", "group", null]) {
      const raw = JSON.stringify({ title: "x", avatarUrl: null, expectedDomain: d });
      expect(readMessengerSplitRoomEntryFrameSeed("r1", raw)).toBeNull();
    }
    expect(readMessengerSplitRoomEntryFrameSeed("r1", null)).toBeNull();
    expect(
      readMessengerSplitRoomEntryFrameSeed("r1", JSON.stringify({ title: "  ", expectedDomain: "general_direct" }))
    ).toBeNull();
  });

  it("seed raw — reads the entry intent of the same room only", () => {
    if (typeof sessionStorage === "undefined") return;
    markRoomEntryIntent("room-a", { title: "A", avatarUrl: null, expectedDomain: "general_direct" });
    expect(readMessengerSplitRoomEntryFrameSeedRaw("room-a")).toContain('"title":"A"');
    expect(readMessengerSplitRoomEntryFrameSeedRaw("room-b")).toBeNull();
  });
});
