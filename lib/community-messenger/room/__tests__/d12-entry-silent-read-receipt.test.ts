import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeCommunityMessengerSilentDeltaIntoSnapshot } from "@/lib/community-messenger/room/merge-community-messenger-silent-delta";
import {
  consumeForegroundBootstrapReuseSkip,
  markCmRoomForegroundReuseEntry,
} from "@/lib/community-messenger/room/cm-room-bootstrap-lock";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/** 1단계 결함 D-12 ③ (2026-10-26): 캐시 재사용 진입 때 상대 읽음 1회 확인 · silent_delta 읽음 위치 앞으로만. */

const ROOM = "c202326f-8109-4ce4-aa61-394f0a799e7d";
const PEER = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";

function snap(lastReadAt: string | null, lastReadMessageId: string | null): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
    room: { id: ROOM, roomType: "direct", unreadCount: 0, lastMessage: "", lastMessageAt: "2026-10-25T19:43:40Z" },
    members: [],
    messages: [],
    ...(lastReadMessageId ? { readReceipt: { roomId: ROOM, readerUserId: PEER, lastReadAt, lastReadMessageId } } : {}),
  } as unknown as CommunityMessengerRoomSnapshot;
}

describe("D-12 ③ silent_delta 상대 읽음 병합", () => {
  it("더 새 읽음 위치면 반영", () => {
    const out = mergeCommunityMessengerSilentDeltaIntoSnapshot(
      snap("2026-10-25T19:34:29Z", "572cdf42"),
      snap("2026-10-25T19:44:02Z", "4ccf4007")
    );
    expect(out.readReceipt?.lastReadMessageId).toBe("4ccf4007");
  });

  it("옛 값·필드 없음(구 서버)이면 그대로", () => {
    const prev = snap("2026-10-25T19:44:02Z", "4ccf4007");
    expect(mergeCommunityMessengerSilentDeltaIntoSnapshot(prev, snap("2026-10-25T19:34:29Z", "572cdf42")).readReceipt?.lastReadMessageId).toBe("4ccf4007");
    expect(mergeCommunityMessengerSilentDeltaIntoSnapshot(prev, snap(null, null)).readReceipt?.lastReadMessageId).toBe("4ccf4007");
  });
});

describe("D-12 ③ 캐시 재사용 진입 표시", () => {
  it("부트스트랩을 건너뛰지 않았으면 false", () => {
    expect(consumeForegroundBootstrapReuseSkip("room-never-evaluated")).toBe(false);
  });

  it("캐시 재사용 진입 표시 → 1회만 true", () => {
    markCmRoomForegroundReuseEntry(ROOM);
    expect(consumeForegroundBootstrapReuseSkip(ROOM)).toBe(true);
    expect(consumeForegroundBootstrapReuseSkip(ROOM)).toBe(false);
  });

  it("네트워크 없이 캐시로 진입하는 3곳 모두 표시 (실기기 04:26: 결정 함수 앞에서 끝나는 경로 누락)", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/room/messenger-room-bootstrap-refresh.ts"), "utf8");
    const blocks = src.split("logCmRoomReentryZeroFetchWithRegression({").slice(1);
    const skipped = blocks.filter((b) => b.slice(0, b.indexOf("});")).includes("foreground_fetch_skipped: true"));
    expect(skipped.length).toBe(3);
    const marks = src.split("markCmRoomForegroundReuseEntry(roomId);").length - 1;
    expect(marks).toBe(3);
    const lock = readFileSync(join(process.cwd(), "lib/community-messenger/room/cm-room-bootstrap-lock.ts"), "utf8");
    expect(lock).not.toContain("st.reuseSkippedAt = Date.now()");
  });

  it("재진입 seeded 스냅샷 분기(네트워크 없음)도 표시 (실기기 04:38 logpoint: 이 분기로 진입)", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle.ts"), "utf8");
    const seeded = src.slice(src.indexOf("if (seededSnapshot) {"), src.indexOf("const cacheFresh ="));
    expect(seeded).toContain("markCmRoomForegroundReuseEntry(roomId);");
    const iMark = seeded.indexOf("markCmRoomForegroundReuseEntry(roomId);");
    expect(iMark).toBeGreaterThan(seeded.indexOf("lifecycle_incomplete_timeline_seed"));
  });

  it("방 진입 effect: 재사용 진입 + 1:1 방에서만 no-store silent_delta 1회 (계약)", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/room/use-messenger-room-client-phase1.ts"), "utf8");
    const i = src.indexOf("consumeForegroundBootstrapReuseSkip(roomId)");
    expect(i).toBeGreaterThan(0);
    const body = src.slice(i, i + 1600);
    expect(body).toContain('roomType !== "direct"');
    expect(body).toContain('cache: "no-store"');
    expect(body).toContain('"entry_silent"');
  });
});
