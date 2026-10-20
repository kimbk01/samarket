import { describe, expect, it, vi } from "vitest";
import { createDeferredCommitQueue, MYPAGE_DEFERRED_COMMIT_MS } from "@/lib/mypage/mypage-deferred-commit";

/** S27 · C6 — 지연 커밋: 5초 경과 커밋 / 되돌리기 시 호출 0 / 이탈 시 즉시 커밋 / 동시 대기 1건 */
describe("createDeferredCommitQueue", () => {
  it("5초 경과 시 커밋", async () => {
    vi.useFakeTimers();
    const q = createDeferredCommitQueue();
    const commit = vi.fn(async () => true);
    q.schedule({ key: "like:p1", commit });
    vi.advanceTimersByTime(MYPAGE_DEFERRED_COMMIT_MS - 1);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("되돌리기(cancel) 시 서버 호출 0", () => {
    vi.useFakeTimers();
    const q = createDeferredCommitQueue();
    const commit = vi.fn(async () => true);
    q.schedule({ key: "save:p1", commit });
    expect(q.cancel("save:p1")).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(commit).not.toHaveBeenCalled();
    expect(q.cancel("save:p1")).toBe(false);
    vi.useRealTimers();
  });

  it("이탈(flush) 시 즉시 커밋, 연속 해제 시 이전 건 즉시 커밋", () => {
    vi.useFakeTimers();
    const q = createDeferredCommitQueue();
    const a = vi.fn(async () => true);
    const b = vi.fn(async () => true);
    q.schedule({ key: "like:a", commit: a });
    q.schedule({ key: "like:b", commit: b });
    expect(a).toHaveBeenCalledTimes(1);
    expect(q.pendingKey()).toBe("like:b");
    q.flush();
    expect(b).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("커밋 실패 → onFail(항목 복귀)", async () => {
    const q = createDeferredCommitQueue({ delayMs: 0 });
    const onFail = vi.fn();
    q.schedule({ key: "like:x", commit: async () => false, onFail });
    q.flush();
    await Promise.resolve();
    await Promise.resolve();
    expect(onFail).toHaveBeenCalledTimes(1);
  });
});
