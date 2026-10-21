import { describe, expect, it } from "vitest";
import {
  readAutoBusinessHoursConfig,
  resolveStoreFrontCommerceState,
} from "@/lib/stores/store-auto-hours";
import {
  applyAutoBusinessHoursToRecord,
  sanitizeBusinessHoursJsonForPersistence,
} from "@/lib/stores/serialize-store-business-hours-json";
import {
  sanitizeStoreClosedDates,
  sanitizeStoreWeeklyHours,
} from "@/lib/stores/store-weekly-hours";
import { buildStoreWeeklyHoursDisplay } from "@/lib/stores/store-weekly-hours-display";
import { computeDiscoveryScheduleProjection } from "@/lib/stores/discovery/compute-discovery-schedule-projection";
import { resolveOwnerStoreCommerceStateLabel } from "@/lib/stores/store-commerce-state-label";
import { STORE_FRONT_COMMERCE_FIXTURES } from "@/lib/stores/__tests__/fixtures/store-front-commerce-fixture-table";

describe("OPS-03 effective commerce state — fixed fixture table (shared with SQL, OPS-08)", () => {
  it.each(STORE_FRONT_COMMERCE_FIXTURES.map((f) => [f.name, f] as const))("%s", (_name, f) => {
    const st = resolveStoreFrontCommerceState(f.business_hours_json, f.is_open, new Date(f.at));
    expect({ open: st.isOpenForCommerce, reason: st.reason }).toEqual({ open: f.open, reason: f.reason });
  });

  it("legacy single-window stores are interpreted exactly as before (minute sweep)", () => {
    for (const [open, close] of [
      ["09:00", "22:00"],
      ["18:00", "02:00"],
    ]) {
      const json = { auto_business_hours: { enabled: true, schedule_enforced: true, timezone: "Asia/Manila", open, close } };
      const [oh, om] = open.split(":").map(Number);
      const [ch, cm] = close.split(":").map(Number);
      const o = oh * 60 + om;
      const c = ch * 60 + cm;
      for (let m = 0; m < 24 * 60; m += 7) {
        const hh = String(Math.floor(m / 60)).padStart(2, "0");
        const mm = String(m % 60).padStart(2, "0");
        const at = new Date(`2026-10-19T${hh}:${mm}:00+08:00`);
        const legacy = o < c ? m >= o && m < c : m >= o || m < c;
        expect(resolveStoreFrontCommerceState(json, true, at).isOpenForCommerce).toBe(legacy);
      }
    }
  });
});

describe("OPS-03 model parsing / persistence", () => {
  it("sanitizes weekly: unknown keys dropped, invalid intervals dropped, null/[] = closed", () => {
    expect(
      sanitizeStoreWeeklyHours({
        mon: null,
        tue: [{ open: "9:00", close: "18:00" }, { open: "bad", close: "x" }],
        wed: [{ open: "10:00", close: "10:00" }],
        funday: [{ open: "01:00", close: "02:00" }],
      })
    ).toEqual({ mon: [], tue: [{ open: "09:00", close: "18:00" }], wed: [] });
    expect(sanitizeStoreWeeklyHours({ funday: [] })).toBeNull();
    expect(sanitizeStoreWeeklyHours(null)).toBeNull();
  });

  it("sanitizes closed dates: valid calendar dates only, deduped and sorted", () => {
    expect(sanitizeStoreClosedDates(["2026-10-20", "2026-02-30", "x", "2026-10-19", "2026-10-20"])).toEqual([
      "2026-10-19",
      "2026-10-20",
    ]);
  });

  it("PATCH sanitizer preserves weekly/closed_dates (enforced and paused)", () => {
    for (const enabled of [true, false]) {
      const out = sanitizeBusinessHoursJsonForPersistence({
        auto_business_hours: {
          enabled,
          schedule_enforced: enabled,
          timezone: "Asia/Manila",
          open: "09:00",
          close: "22:00",
          weekly: { mon: null, sat: [{ open: "10:00", close: "14:00" }] },
          closed_dates: ["2026-12-25"],
        },
      });
      const a = out.auto_business_hours as Record<string, unknown>;
      expect(a.weekly).toEqual({ mon: null, sat: [{ open: "10:00", close: "14:00" }] });
      expect(a.closed_dates).toEqual(["2026-12-25"]);
    }
  });

  it("legacy payload stays byte-for-byte the old shape (no new keys)", () => {
    const out = sanitizeBusinessHoursJsonForPersistence({
      auto_business_hours: { enabled: true, schedule_enforced: true, timezone: "Asia/Manila", open: "09:00", close: "22:00" },
    });
    expect(out.auto_business_hours).toEqual({
      enabled: true,
      schedule_enforced: true,
      timezone: "Asia/Manila",
      open: "09:00",
      close: "22:00",
    });
  });

  it("owner form serializer writes weekly/closed_dates and drops the misleading daily summary", () => {
    const prev: Record<string, unknown> = {};
    applyAutoBusinessHoursToRecord(prev, {
      autoBusinessHoursEnabled: true,
      autoHoursTz: "Asia/Manila",
      autoHoursOpen: "09:00",
      autoHoursClose: "22:00",
      weekly: { mon: [] },
      closedDates: ["2026-12-25"],
    });
    const cfg = readAutoBusinessHoursConfig(prev);
    expect(cfg?.weekly).toEqual({ mon: [] });
    expect(cfg?.closedDates).toEqual(["2026-12-25"]);
    expect(prev.weekdays).toBeUndefined();
  });

  it("public display rows: default / custom / closed + upcoming closed dates", () => {
    const json = {
      auto_business_hours: {
        enabled: true,
        schedule_enforced: true,
        timezone: "Asia/Manila",
        open: "09:00",
        close: "22:00",
        weekly: { mon: null, sat: [{ open: "10:00", close: "14:00" }] },
        closed_dates: ["2026-10-01", "2026-12-25"],
      },
    };
    const d = buildStoreWeeklyHoursDisplay(json, new Date("2026-10-19T12:00:00+08:00"));
    expect(d.rows?.find((r) => r.day === "mon")?.hoursLabel).toBeNull();
    expect(d.rows?.find((r) => r.day === "tue")?.hoursLabel).toBe("09:00–22:00");
    expect(d.rows?.find((r) => r.day === "sat")?.hoursLabel).toBe("10:00–14:00");
    expect(d.upcomingClosedDates).toEqual(["2026-12-25"]);
    expect(buildStoreWeeklyHoursDisplay({}, new Date()).rows).toBeNull();
  });

  it("discovery projection: closed weekday is CLOSED and next transition includes the next midnight", () => {
    const json = {
      auto_business_hours: {
        enabled: true,
        schedule_enforced: true,
        timezone: "Asia/Manila",
        open: "09:00",
        close: "22:00",
        weekly: { mon: null },
      },
    };
    const p = computeDiscoveryScheduleProjection({
      business_hours_json: json,
      is_open: true,
      now: new Date("2026-10-19T12:00:00+08:00"),
    });
    expect(p.discoveryScheduleState).toBe("CLOSED");
    expect(p.nextScheduleTransitionAt).toBe(new Date("2026-10-19T22:00:00+08:00").toISOString());
    const late = computeDiscoveryScheduleProjection({
      business_hours_json: json,
      is_open: true,
      now: new Date("2026-10-19T23:00:00+08:00"),
    });
    expect(late.nextScheduleTransitionAt).toBe(new Date("2026-10-20T00:00:00+08:00").toISOString());
  });
});

describe("OPS-04 owner label = buyer/admin effective state", () => {
  it.each([
    [{ is_open: "false" }, "store_commerce_state_manual_closed"],
    [{ is_open: null }, "store_commerce_state_open"],
  ] as const)("raw is_open %j → %s (no schedule)", (row, key) => {
    expect(resolveOwnerStoreCommerceStateLabel({ business_hours_json: {}, ...row }).labelKey).toBe(key);
  });

  it("is_open=true but outside schedule shows outside hours (not 영업중)", () => {
    const row = {
      is_open: true,
      business_hours_json: {
        auto_business_hours: { enabled: true, schedule_enforced: true, timezone: "Asia/Manila", open: "09:00", close: "22:00" },
        break_hours: { start: "14:00", end: "15:00" },
      },
    };
    expect(resolveOwnerStoreCommerceStateLabel(row, new Date("2026-10-19T03:00:00+08:00")).labelKey).toBe(
      "store_commerce_state_outside_hours"
    );
    expect(resolveOwnerStoreCommerceStateLabel(row, new Date("2026-10-19T14:30:00+08:00")).labelKey).toBe(
      "store_commerce_state_break"
    );
  });
});
