import { describe, expect, it } from "vitest";
import {
  NEW_STORE_WINDOW_DAYS,
  NEW_STORE_WINDOW_MS,
  compareNewStoreShelfRows,
  isNewStoreSignal,
} from "@/lib/stores/store-new-store-signal";

const NOW = Date.parse("2026-08-23T10:00:00.000Z");

describe("P1-C2 new-store signal", () => {
  it("locks window to 30 days", () => {
    expect(NEW_STORE_WINDOW_DAYS).toBe(30);
    expect(NEW_STORE_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("NULL first_listed_at is not new (legacy visible)", () => {
    expect(isNewStoreSignal({ firstListedAt: null, nowMs: NOW })).toBe(false);
    expect(isNewStoreSignal({ firstListedAt: undefined, nowMs: NOW })).toBe(false);
    expect(isNewStoreSignal({ firstListedAt: "  ", nowMs: NOW })).toBe(false);
  });

  it("within 30d window is new", () => {
    const listed = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isNewStoreSignal({ firstListedAt: listed, nowMs: NOW })).toBe(true);
  });

  it("exactly 30d boundary is still new", () => {
    const listed = new Date(NOW - NEW_STORE_WINDOW_MS).toISOString();
    expect(isNewStoreSignal({ firstListedAt: listed, nowMs: NOW })).toBe(true);
  });

  it("past 30d is not new", () => {
    const listed = new Date(NOW - NEW_STORE_WINDOW_MS - 1).toISOString();
    expect(isNewStoreSignal({ firstListedAt: listed, nowMs: NOW })).toBe(false);
  });

  it("orders shelf by first_listed_at DESC", () => {
    const a = { id: "a", firstListedAt: "2026-08-01T00:00:00.000Z" };
    const b = { id: "b", firstListedAt: "2026-08-20T00:00:00.000Z" };
    expect(compareNewStoreShelfRows(a, b)).toBeGreaterThan(0);
    expect([b, a].sort(compareNewStoreShelfRows).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
