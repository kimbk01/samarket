/**
 * 읽음 1단계 (docs/audit/supabase-request-surge-2026-11-18/read-mark-legacy-design-2026-11-19.md):
 * 바뀐 것 없는 원자 읽음(duplicateSkipped)은 사본 재생성·무효화 표시를 하지 않는다. 바뀐 읽음은 지금과 같다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { atomicReadChangedState } from "@/lib/community-messenger/room-unread-authority-rpc";

const base = {
  ok: true as const,
  lastReadAt: "2026-11-19T00:00:00Z",
  lastReadMessageId: "m1",
  unreadCount: 0,
  lastReadAdvanced: false,
  regressionBlocked: false,
};

describe("읽음 1단계 — 바뀐 것 없으면 후속 작업 없음", () => {
  it("duplicateSkipped → 바뀐 것 없음", () => {
    expect(atomicReadChangedState({ ...base, duplicateSkipped: true } as never)).toBe(false);
  });
  it("보완: 같은 key 재요청(replayed) → 바뀐 것 없음", () => {
    expect(
      atomicReadChangedState({ ...base, duplicateSkipped: false, lastReadAdvanced: true, replayed: true } as never),
    ).toBe(false);
  });
  it("실제로 읽음 처리됨 → 바뀜(기존 후속 작업 그대로)", () => {
    expect(atomicReadChangedState({ ...base, duplicateSkipped: false, lastReadAdvanced: true } as never)).toBe(true);
  });
  it("service 원자 경로가 사본 재생성·무효화를 이 판정 안에서만 부른다", () => {
    const src = readFileSync("lib/community-messenger/service.ts", "utf8");
    const i = src.indexOf("if (atomicReadChangedState(atomic)) {");
    expect(i).toBeGreaterThan(0);
    const block = src.slice(i, i + 600);
    for (const call of [
      "invalidateOwnerHubBadgeCache(input.userId, { source: \"messenger\" })",
      "invalidateHomeSyncSnapshotCache(input.userId)",
      "invalidateCmBootstrapSnapshotCache(input.userId)",
      "invalidateFullBootstrapSnapshotCache(input.userId, \"mark_read\")",
    ]) {
      expect(block).toContain(call);
    }
    /** 방송 생략: 중복·재생 모두 */
    expect(src).toContain("broadcastSkipped: !atomicReadChangedState(atomic)");
  });
});
