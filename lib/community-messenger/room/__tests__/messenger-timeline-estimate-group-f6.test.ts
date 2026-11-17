/**
 * F6 (설계 2026-11-18 PR-1) 높이 추정 2경로 일치 — 합계·대체 행 시작점이 가상 스크롤 estimateSize 와 같은 규칙(그룹 이름 줄).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMessengerRoomFallbackVirtualRows,
  estimateMessengerRoomTimelineTotalHeight,
} from "@/lib/community-messenger/room/messenger-room-timeline-paint-model";
import { estimateMessengerTimelineRowPx } from "@/lib/store-order-chat/messenger-timeline-row-estimate";

const rows = [
  { messageType: "text" as const, content: "hi", metadata: null, isMine: false },
  { messageType: "text" as const, content: "me", metadata: null, isMine: true },
  { messageType: "text" as const, content: "yo", metadata: null, isMine: false },
];

const sumEstimate = (isGroupRoom: boolean) =>
  rows.reduce((n, r) => n + estimateMessengerTimelineRowPx(r, { isGroupRoom }), 0);

describe("F6 높이 추정 — 그룹 방 규칙 일치", () => {
  it("합계 = 행별 estimateSize 합(그룹·1:1 각각)", () => {
    expect(estimateMessengerRoomTimelineTotalHeight(rows, { isGroupRoom: true })).toBe(sumEstimate(true));
    expect(estimateMessengerRoomTimelineTotalHeight(rows, { isGroupRoom: false })).toBe(sumEstimate(false));
    expect(sumEstimate(true) - sumEstimate(false)).toBe(44);
  });

  it("대체 행 시작점도 같은 규칙", () => {
    const g = buildMessengerRoomFallbackVirtualRows(rows, { isGroupRoom: true });
    expect(g.map((r) => r.start)).toEqual([0, 77, 132]);
    const d = buildMessengerRoomFallbackVirtualRows(rows);
    expect(d.map((r) => r.start)).toEqual([0, 55, 110]);
  });

  it("호출처가 방 종류를 넘긴다(Timeline 전체 높이 힌트·앞쪽 페이지 높이 보정)", () => {
    const timeline = readFileSync(
      path.join(process.cwd(), "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx"),
      "utf8"
    );
    expect(timeline).toContain("estimateMessengerRoomTimelineTotalHeight(vm.displayRoomMessages, { isGroupRoom: vm.isGroupRoom })");
    expect(timeline).toContain("estimateMessengerTimelineRowPx(messages[i], { isGroupRoom })");
    const older = readFileSync(
      path.join(process.cwd(), "lib/community-messenger/room/use-messenger-room-load-older-messages-fetch.ts"),
      "utf8"
    );
    expect(older).toMatch(/estimateMessengerRoomTimelineTotalHeight\(prependedMessages, \{\s*\/\*\*[^*]*\*\/\s*isGroupRoom:/);
  });
});
