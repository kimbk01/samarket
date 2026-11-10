/**
 * 채팅 P0-1 계약 (Owner 「채팅 P0 승인」 2026-11-11 · docs/audit/messenger-p0-structural-audit-design-2026-11-11.md):
 * 방 진입 중 타임라인 전체가 반복해서 다시 그려지지 않도록 하는 구조 —
 * ① 병합은 내용이 같은 행·배열 참조를 유지 ② 행 측정 ref 는 고정 참조 ③ 시각 포맷터는 모듈 1개
 * ④ 파생 목록은 부모 렌더에서 계산(자식 → 부모 state 재주입 없음) ⑤ snapshot → 메시지 동기는 같은 렌더.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  mergeRoomMessages,
  preserveRoomMessageReferences,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

type Row = CommunityMessengerMessage & { pending?: boolean };

function row(id: string, createdAt: string, extra: Partial<Row> = {}): Row {
  return {
    id,
    roomId: "room-1",
    senderId: "u1",
    senderLabel: "A",
    senderAvatarUrl: null,
    messageType: "text",
    content: `m-${id}`,
    createdAt,
    isMine: false,
    ...extra,
  } as Row;
}

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("채팅 P0-1 — 병합 참조 유지", () => {
  it("같은 내용으로 다시 병합하면 이전 배열을 그대로 돌려준다", () => {
    const prev = [row("a", "2026-11-11T01:00:00.000Z"), row("b", "2026-11-11T01:01:00.000Z")];
    const copy = prev.map((m) => ({ ...m, pending: false }));
    expect(mergeRoomMessages(prev, copy)).toBe(prev);
  });

  it("한 행만 바뀌면 나머지 행 객체는 그대로이고, 순서·내용은 예전과 같다", () => {
    const prev = [row("a", "2026-11-11T01:00:00.000Z"), row("b", "2026-11-11T01:01:00.000Z")];
    const next = mergeRoomMessages(prev, [{ ...prev[1]!, content: "edited" }]);
    expect(next).not.toBe(prev);
    expect(next[0]).toBe(prev[0]);
    expect(next[1]!.content).toBe("edited");
    expect(next.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("새 행이 오면 기존 행 객체는 유지하고 시간순으로 붙는다", () => {
    const prev = [row("a", "2026-11-11T01:00:00.000Z")];
    const next = mergeRoomMessages(prev, [row("c", "2026-11-11T01:02:00.000Z"), { ...prev[0]! }]);
    expect(next[0]).toBe(prev[0]);
    expect(next.map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("metadata 가 같은 내용의 새 객체여도 같은 행으로 본다", () => {
    const prev = [row("a", "2026-11-11T01:00:00.000Z", { metadata: { x: 1, nested: { y: [1, 2] } } as never })];
    const again = { ...prev[0]!, metadata: { x: 1, nested: { y: [1, 2] } } as never };
    expect(mergeRoomMessages(prev, [again])).toBe(prev);
  });

  it("preserveRoomMessageReferences — 다른 출처 사본이어도 내용이 같으면 React 쪽 객체 유지", () => {
    const prev = [row("a", "2026-11-11T01:00:00.000Z"), row("b", "2026-11-11T01:01:00.000Z")];
    const fromStore = prev.map((m) => ({ ...m }));
    expect(preserveRoomMessageReferences(prev, fromStore)).toBe(prev);
    const withNew = [...fromStore, row("c", "2026-11-11T01:02:00.000Z")];
    const out = preserveRoomMessageReferences(prev, withNew);
    expect(out[0]).toBe(prev[0]);
    expect(out[1]).toBe(prev[1]);
    expect(out[2]).toBe(withNew[2]);
  });
});

describe("채팅 P0-1 — 시각 포맷터 1개", () => {
  it("formatMessengerClockTime 은 여러 번 불러도 Intl.DateTimeFormat 을 1번만 만든다", async () => {
    vi.resetModules();
    const spy = vi.spyOn(Intl, "DateTimeFormat");
    const { formatMessengerClockTime } = await import("@/lib/community-messenger/messenger-clock-time");
    for (let i = 0; i < 50; i += 1) formatMessengerClockTime("2026-11-11T01:00:00.000Z");
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    expect(formatMessengerClockTime("2026-11-11T13:05:00.000Z")).toMatch(/\d{1,2}:05\s?(AM|PM)/);
    spy.mockRestore();
  });
});

describe("채팅 P0-1 — 구조 계약(소스)", () => {
  const timeline = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx");
  const host = read("components/community-messenger/room/MessengerRoomPhase1TimelineHeavyHost.tsx");
  const heavy = read("lib/community-messenger/room/use-messenger-room-phase1-timeline-heavy.ts");
  const phase1 = read("lib/community-messenger/room/use-messenger-room-client-phase1.ts");

  it("행 measureElement 에 렌더마다 새 화살표 함수를 넘기지 않는다", () => {
    const block = timeline.slice(timeline.indexOf("measureElement={"), timeline.indexOf("rowPaddingTopClass={rowPaddingTopClass}"));
    expect(block).not.toMatch(/=>/);
    expect(block).toContain("measureVirtualRowStable");
  });

  it("타임라인은 toLocaleDateString(호출마다 포맷터 생성)을 쓰지 않는다", () => {
    expect(timeline).not.toMatch(/toLocaleDateString\(/);
  });

  it("무거운 부착 훅은 파생 목록을 계산하지 않고 virtualizer 만 부모에 넘긴다", () => {
    expect(heavy).not.toContain("useMessengerRoomDerivedMessageLists");
    expect(host).toContain("onReadyRef.current(virtualizer)");
    expect(phase1).toContain("useMessengerRoomDerivedMessageLists(");
  });

  it("snapshot → 타임라인 메시지 동기는 layoutEffect 가 아니라 같은 렌더에서 한다", () => {
    expect(phase1).toContain("if (timelineSeedSyncedSnapshot !== snapshot)");
    expect(phase1).not.toMatch(/useLayoutEffect\(\(\) => \{\s*const snap = snapshot;/);
  });
});
