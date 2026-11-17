// @vitest-environment jsdom
/**
 * P1 (Owner 2026-11-18 「권장안대로 반영」) — 결과 불명 실패 글 보관: 방을 나갔다 와도 실패 행 복원.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MESSENGER_FAILED_TEXT_PER_ROOM_MAX,
  MESSENGER_FAILED_TEXT_STORAGE_KEY,
  MESSENGER_FAILED_TEXT_TOTAL_MAX,
  clearMessengerFailedTextSends,
  listMessengerFailedTextSends,
  pruneMessengerFailedTextSendsConfirmed,
  removeMessengerFailedTextSend,
  saveMessengerFailedTextSend,
} from "@/lib/community-messenger/room/messenger-failed-text-store";

const entry = (cid: string, savedAt: number) => ({
  clientMessageId: cid,
  content: `msg ${cid}`,
  replyToMessageId: null,
  createdAt: new Date(savedAt).toISOString(),
  savedAt,
});

afterEach(() => {
  clearMessengerFailedTextSends();
  vi.restoreAllMocks();
});

describe("실패 글 보관", () => {
  it("저장·조회·삭제 (방별)", () => {
    saveMessengerFailedTextSend("r1", entry("c1", 1));
    saveMessengerFailedTextSend("r2", entry("c2", 2));
    expect(listMessengerFailedTextSends("r1").map((e) => e.clientMessageId)).toEqual(["c1"]);
    removeMessengerFailedTextSend("r1", "c1");
    expect(listMessengerFailedTextSends("r1")).toEqual([]);
    expect(listMessengerFailedTextSends("r2")).toHaveLength(1);
  });

  it("같은 cid 재저장은 1건으로 덮는다", () => {
    saveMessengerFailedTextSend("r1", entry("c1", 1));
    saveMessengerFailedTextSend("r1", { ...entry("c1", 2), content: "edited" });
    const list = listMessengerFailedTextSends("r1");
    expect(list).toHaveLength(1);
    expect(list[0]!.content).toBe("edited");
  });

  it("방당 20건 상한 — 오래된 것부터 삭제", () => {
    for (let i = 0; i < MESSENGER_FAILED_TEXT_PER_ROOM_MAX + 3; i += 1) saveMessengerFailedTextSend("r1", entry(`c${i}`, i));
    const list = listMessengerFailedTextSends("r1");
    expect(list).toHaveLength(MESSENGER_FAILED_TEXT_PER_ROOM_MAX);
    expect(list[0]!.clientMessageId).toBe("c3");
  });

  it("전체 200건 상한 — 오래된 것부터 삭제", () => {
    let t = 0;
    for (let r = 0; r < 11; r += 1) {
      for (let i = 0; i < 20; i += 1) saveMessengerFailedTextSend(`room${r}`, entry(`r${r}c${i}`, t++));
    }
    const raw = JSON.parse(localStorage.getItem(MESSENGER_FAILED_TEXT_STORAGE_KEY) ?? "{}") as Record<string, unknown[]>;
    const total = Object.values(raw).reduce((n, l) => n + l.length, 0);
    expect(total).toBe(MESSENGER_FAILED_TEXT_TOTAL_MAX);
    expect(listMessengerFailedTextSends("room0")).toEqual([]);
    expect(listMessengerFailedTextSends("room10")).toHaveLength(20);
  });

  it("같은 cid 확정 행이 오면 보관에서 제거", () => {
    saveMessengerFailedTextSend("r1", entry("c1", 1));
    saveMessengerFailedTextSend("r1", entry("c2", 2));
    expect(pruneMessengerFailedTextSendsConfirmed("r1", new Set(["c2", "zz"]))).toEqual(["c2"]);
    expect(listMessengerFailedTextSends("r1").map((e) => e.clientMessageId)).toEqual(["c1"]);
  });

  it("로그아웃 정리 + 깨진 값·저장소 오류에도 예외 없음", () => {
    saveMessengerFailedTextSend("r1", entry("c1", 1));
    clearMessengerFailedTextSends();
    expect(localStorage.getItem(MESSENGER_FAILED_TEXT_STORAGE_KEY)).toBeNull();
    localStorage.setItem(MESSENGER_FAILED_TEXT_STORAGE_KEY, "{not json");
    expect(listMessengerFailedTextSends("r1")).toEqual([]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveMessengerFailedTextSend("r1", entry("c9", 9))).not.toThrow();
  });

  it("로그아웃 정리 목록에 등록되어 있다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(`${process.cwd()}/lib/auth/client-session-wipe.ts`, "utf8");
    expect(src).toContain("clearMessengerFailedTextSends();");
  });
});
