import { describe, expect, it } from "vitest";
import { addBounded, getAndTouch, pushBounded, setBounded } from "@/lib/collections/bounded-collections";

describe("bounded collections", () => {
  it("Set 은 상한을 넘으면 가장 오래된 것부터 버린다", () => {
    const s = new Set<number>();
    for (let i = 0; i < 10_000; i += 1) addBounded(s, i, 100);
    expect(s.size).toBe(100);
    expect(s.has(9_999)).toBe(true);
    expect(s.has(9_899)).toBe(false);
  });

  it("다시 넣은 항목은 최근으로 옮겨 살아남는다", () => {
    const s = new Set<string>();
    addBounded(s, "a", 2);
    addBounded(s, "b", 2);
    addBounded(s, "a", 2);
    addBounded(s, "c", 2);
    expect([...s]).toEqual(["a", "c"]);
  });

  it("Map 상한·읽기 최근 표시", () => {
    const m = new Map<string, number>();
    setBounded(m, "a", 1, 2);
    setBounded(m, "b", 2, 2);
    expect(getAndTouch(m, "a")).toBe(1);
    setBounded(m, "c", 3, 2);
    expect([...m.keys()]).toEqual(["a", "c"]);
  });

  it("배열 버퍼는 최근 n개만", () => {
    const arr: number[] = [];
    for (let i = 0; i < 1_000; i += 1) pushBounded(arr, i, 200);
    expect(arr.length).toBe(200);
    expect(arr[0]).toBe(800);
  });
});
