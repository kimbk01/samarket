import { describe, expect, it } from "vitest";
import { runSingleFlight, runSingleFlightWithTrailing } from "@/lib/http/run-single-flight";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("runSingleFlightWithTrailing (D-5)", () => {
  it("진행 중이 없으면 바로 1회", async () => {
    let n = 0;
    await expect(runSingleFlightWithTrailing("k0", async () => ++n)).resolves.toBe(1);
    expect(n).toBe(1);
  });

  it("진행 중에 온 요청은 합류 대신 끝난 뒤 1회 더 — 기록 저장 전 조회를 놓치지 않음", async () => {
    const first = deferred<string>();
    const calls: string[] = [];
    const a = runSingleFlight("k1", () => {
      calls.push("first");
      return first.promise;
    });
    const b = runSingleFlightWithTrailing("k1", async () => {
      calls.push("trailing");
      return "fresh";
    });
    const c = runSingleFlightWithTrailing("k1", async () => {
      calls.push("trailing-2");
      return "fresh-2";
    });
    first.resolve("stale");
    await expect(a).resolves.toBe("stale");
    await expect(b).resolves.toBe("fresh");
    await expect(c).resolves.toBe("fresh");
    expect(calls).toEqual(["first", "trailing"]);
  });

  it("뒤따름이 이미 실행 중일 때 온 요청은 그 다음에 다시 1회", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const calls: string[] = [];
    void runSingleFlight("k2", () => {
      calls.push("first");
      return first.promise;
    });
    const t1 = runSingleFlightWithTrailing("k2", () => {
      calls.push("t1");
      return second.promise;
    });
    first.resolve("a");
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual(["first", "t1"]);
    const t2 = runSingleFlightWithTrailing("k2", async () => {
      calls.push("t2");
      return "c";
    });
    second.resolve("b");
    await expect(t1).resolves.toBe("b");
    await expect(t2).resolves.toBe("c");
    expect(calls).toEqual(["first", "t1", "t2"]);
  });

  it("진행 중 조회가 실패해도 뒤따름은 실행", async () => {
    const failing = runSingleFlight("k3", async () => {
      throw new Error("x");
    });
    const t = runSingleFlightWithTrailing("k3", async () => "ok");
    await expect(failing).rejects.toThrow("x");
    await expect(t).resolves.toBe("ok");
  });
});
