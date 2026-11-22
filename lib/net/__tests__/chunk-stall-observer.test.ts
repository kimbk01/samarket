// @vitest-environment jsdom
/**
 * 조각 받기 멈춤 관찰 — 설계 docs/audit/idle-menu-freeze-design-2026-11-22.md §S1 (관찰만, 동작 무변경).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chunkUrlOf, startChunkStallObserver, type ChunkStallReport } from "@/lib/net/chunk-stall-observer.client";

let reports: ChunkStallReport[] = [];
let stop: () => void = () => {};
let now = 0;

function addScript(src: string): HTMLScriptElement {
  const s = document.createElement("script");
  s.src = src;
  document.head.appendChild(s);
  return s;
}
const flush = () => Promise.resolve();

beforeEach(() => {
  vi.useFakeTimers();
  reports = [];
  now = 1_000;
  stop = startChunkStallObserver(document.head, {
    thresholdMs: 8_000,
    now: () => now,
    currentPathname: () => "/philife",
    report: (r) => void reports.push(r),
  });
});
afterEach(() => {
  stop();
  document.head.innerHTML = "";
  vi.useRealTimers();
});

describe("조각 판정", () => {
  it("/_next/static/ 스크립트·스타일시트만", () => {
    const s = document.createElement("script");
    s.src = "https://x/_next/static/chunks/a.js";
    expect(chunkUrlOf(s)).not.toBeNull();
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://x/_next/static/chunks/a.css";
    expect(chunkUrlOf(l)).not.toBeNull();
    const other = document.createElement("script");
    other.src = "https://cdn.example.com/x.js";
    expect(chunkUrlOf(other)).toBeNull();
    const pre = document.createElement("link");
    pre.rel = "preload";
    pre.href = "https://x/_next/static/chunks/a.js";
    expect(chunkUrlOf(pre)).toBeNull();
  });
});

describe("관찰", () => {
  it("8초 안에 끝난 조각은 기록 0", async () => {
    const s = addScript("/_next/static/chunks/fast.js");
    await flush();
    now += 2_000;
    vi.advanceTimersByTime(2_000);
    s.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(20_000);
    expect(reports).toEqual([]);
  });

  it("8초 넘긴 조각 — 끝났을 때 실제 기다린 시간으로 1건", async () => {
    const s = addScript("/_next/static/chunks/slow.js");
    await flush();
    vi.advanceTimersByTime(8_000);
    now += 27 * 60_000;
    s.dispatchEvent(new Event("error"));
    expect(reports).toEqual([{ waitedMs: 27 * 60_000, result: "error", target: "community" }]);
  });

  it("끝나기 전에 문서가 사라지면(pagehide) pending 으로 1건 · 문서당 1건", async () => {
    addScript("/_next/static/chunks/a.js");
    addScript("/_next/static/chunks/b.js");
    await flush();
    vi.advanceTimersByTime(8_000);
    now += 9_000;
    window.dispatchEvent(new Event("pagehide"));
    expect(reports).toEqual([{ waitedMs: 9_000, result: "pending", target: "community" }]);
  });

  it("head 밖(body)에 붙은 요소는 보지 않는다", async () => {
    const s = document.createElement("script");
    s.src = "/_next/static/chunks/body.js";
    document.body.appendChild(s);
    await flush();
    vi.advanceTimersByTime(10_000);
    s.dispatchEvent(new Event("error"));
    expect(reports).toEqual([]);
    s.remove();
  });
});
