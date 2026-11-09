import { describe, expect, it } from "vitest";
import { BoundedMap, ExpiringBoundedMap } from "@/lib/http/expiring-bounded-map";

describe("ExpiringBoundedMap — 쓰기 시점 만료 정리 + 상한", () => {
  it("서로 다른 키 1,000개 + TTL×2 경과 후 set 1회 → 만료 항목 전부 정리, 크기 평탄", () => {
    let now = 0;
    const m = new ExpiringBoundedMap<string, { expiresAt: number; v: number }>(50, () => now);
    for (let i = 0; i < 1_000; i += 1) {
      m.set(`k${i}`, { expiresAt: now + 15_000, v: i });
      now += 10; // 10초 동안 1,000개
    }
    expect(m.size).toBeLessThanOrEqual(50);
    now += 30_000;
    m.set("after", { expiresAt: now + 15_000, v: -1 });
    expect(m.size).toBe(1);
    const sizes: number[] = [];
    for (let r = 0; r < 5; r += 1) {
      for (let i = 0; i < 200; i += 1) m.set(`r${r}-${i}`, { expiresAt: now + 15_000, v: i });
      sizes.push(m.size);
      now += 30_000;
    }
    expect(Math.max(...sizes)).toBeLessThanOrEqual(50);
  });

  it("읽기 의미 불변 — 유효 항목은 그대로 get", () => {
    let now = 0;
    const m = new ExpiringBoundedMap<string, { expiresAt: number }>(10, () => now);
    m.set("a", { expiresAt: 100 });
    now = 50;
    m.set("b", { expiresAt: 200 });
    expect(m.get("a")?.expiresAt).toBe(100);
  });
});

describe("BoundedMap — 상한만(SWR 캐시용, 만료 항목도 보존)", () => {
  it("만료 여부와 무관하게 크기 상한만 적용", () => {
    const m = new BoundedMap<string, number>(4);
    for (let i = 0; i < 10; i += 1) m.set(`k${i}`, i);
    expect([...m.keys()]).toEqual(["k6", "k7", "k8", "k9"]);
  });
});
