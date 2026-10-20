import { describe, expect, it } from "vitest";
import {
  communityAdminListPeriodParams,
  manilaDateKeysInRange,
  manilaDayStartMs,
  parseCommunityAdminPage,
  parseCommunityAdminPeriod,
} from "@/lib/admin/community-admin/community-admin-period";

// 2026-10-19 07:30 PHT = 2026-10-18T23:30Z (UTC 기준으로는 아직 18일)
const NOW_EARLY_PHT = new Date("2026-10-18T23:30:00Z");
// 2026-10-19 23:50 PHT = 2026-10-19T15:50Z
const NOW_LATE_PHT = new Date("2026-10-19T15:50:00Z");

describe("community admin period parsing (Asia/Manila boundaries)", () => {
  it("today = Manila midnight even when UTC is still the previous day", () => {
    const r = parseCommunityAdminPeriod({ period: "today" }, { now: NOW_EARLY_PHT });
    expect(r).toMatchObject({
      ok: true,
      fromIso: "2026-10-18T16:00:00.000Z",
      toIso: "2026-10-19T16:00:00.000Z",
      fromDate: "2026-10-19",
      toDate: "2026-10-19",
    });
    const late = parseCommunityAdminPeriod({ period: "today" }, { now: NOW_LATE_PHT });
    expect(late).toMatchObject({ fromIso: "2026-10-18T16:00:00.000Z", toIso: "2026-10-19T16:00:00.000Z" });
  });

  it("7d / 30d include today (7 / 30 Manila dates)", () => {
    expect(parseCommunityAdminPeriod({ period: "7d" }, { now: NOW_EARLY_PHT })).toMatchObject({
      fromIso: "2026-10-12T16:00:00.000Z",
      toIso: "2026-10-19T16:00:00.000Z",
      fromDate: "2026-10-13",
      toDate: "2026-10-19",
    });
    expect(parseCommunityAdminPeriod({ period: "30d" }, { now: NOW_EARLY_PHT })).toMatchObject({
      fromDate: "2026-09-20",
      toDate: "2026-10-19",
    });
  });

  it("custom from/to are inclusive Manila dates → UTC [from, to+1)", () => {
    expect(parseCommunityAdminPeriod({ period: "custom", from: "2026-10-01", to: "2026-10-05" })).toMatchObject({
      ok: true,
      fromIso: "2026-09-30T16:00:00.000Z",
      toIso: "2026-10-05T16:00:00.000Z",
    });
    // dates without period → custom; single date → that day
    expect(parseCommunityAdminPeriod({ from: "2026-10-03" })).toMatchObject({
      period: "custom",
      fromIso: "2026-10-02T16:00:00.000Z",
      toIso: "2026-10-03T16:00:00.000Z",
    });
  });

  it("rejects bad input", () => {
    expect(parseCommunityAdminPeriod({ period: "week" })).toEqual({ ok: false, error: "invalid_period" });
    expect(parseCommunityAdminPeriod({ period: "custom", from: "2026-02-30" })).toEqual({ ok: false, error: "invalid_date" });
    expect(parseCommunityAdminPeriod({ period: "custom" })).toEqual({ ok: false, error: "invalid_date" });
    expect(parseCommunityAdminPeriod({ period: "custom", from: "2026-10-05", to: "2026-10-01" })).toEqual({
      ok: false,
      error: "range_reversed",
    });
    expect(parseCommunityAdminPeriod({ period: "custom", from: "2025-01-01", to: "2026-10-01" })).toEqual({
      ok: false,
      error: "range_too_long",
    });
  });

  it("default period: all for lists, configurable", () => {
    expect(parseCommunityAdminPeriod({})).toMatchObject({ ok: true, period: "all", fromIso: null, toIso: null });
    expect(parseCommunityAdminPeriod({}, { defaultPeriod: "7d", now: NOW_LATE_PHT })).toMatchObject({ period: "7d" });
  });

  it("day helpers", () => {
    expect(manilaDayStartMs("2026-10-19")).toBe(Date.parse("2026-10-18T16:00:00Z"));
    expect(manilaDayStartMs("2026-13-01")).toBeNull();
    expect(manilaDateKeysInRange("2026-10-16T16:00:00Z", "2026-10-19T16:00:00Z")).toEqual([
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
    ]);
  });

  it("pagination: limit ≤ 100, offset ≥ 0", () => {
    expect(parseCommunityAdminPage(new URLSearchParams("limit=500&offset=-3"))).toEqual({ limit: 100, offset: 0 });
    expect(parseCommunityAdminPage(new URLSearchParams(""))).toEqual({ limit: 50, offset: 0 });
    expect(parseCommunityAdminPage(new URLSearchParams("limit=20&offset=40"))).toEqual({ limit: 20, offset: 40 });
  });

  it("R7 list filter bar dates → API period params (legacy preset links kept)", () => {
    expect(communityAdminListPeriodParams({}, NOW_EARLY_PHT)).toEqual({ period: "all" });
    expect(communityAdminListPeriodParams({ period: "7d" }, NOW_EARLY_PHT)).toEqual({ period: "7d" });
    expect(communityAdminListPeriodParams({ period: "custom" }, NOW_EARLY_PHT)).toEqual({ period: "all" });
    expect(communityAdminListPeriodParams({ period: "7d", from: "2026-10-01", to: "2026-10-05" })).toEqual({
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-05",
    });
    // 종료일만 비면 오늘(PHT) — UTC 로는 아직 18일이어도 19일
    expect(communityAdminListPeriodParams({ from: "2026-10-01" }, NOW_EARLY_PHT)).toEqual({
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-19",
    });
    // 시작일만 비면 최대 범위(400일) 안의 첫날 — 서버 파서가 range_too_long 으로 막지 않는다
    const onlyTo = communityAdminListPeriodParams({ to: "2026-10-19" }, NOW_EARLY_PHT);
    expect(onlyTo.period).toBe("custom");
    const parsed = parseCommunityAdminPeriod(onlyTo, { now: NOW_EARLY_PHT });
    expect(parsed.ok).toBe(true);
  });
});
