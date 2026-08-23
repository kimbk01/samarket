import { describe, expect, it } from "vitest";
import { computeDiscoveryScheduleProjection } from "@/lib/stores/discovery/compute-discovery-schedule-projection";
import { STORE_AUTO_SCHEDULE_ENFORCED_KEY } from "@/lib/stores/serialize-store-business-hours-json";

function autoHoursJson(opts: {
  open?: string;
  close?: string;
  timezone?: string;
  break?: { start: string; end: string } | null;
}) {
  return {
    auto_business_hours: {
      enabled: true,
      timezone: opts.timezone ?? "Asia/Manila",
      open: opts.open ?? "09:00",
      close: opts.close ?? "22:00",
      [STORE_AUTO_SCHEDULE_ENFORCED_KEY]: true,
    },
    ...(opts.break
      ? {
          break_hours: {
            start: opts.break.start,
            end: opts.break.end,
          },
        }
      : {}),
  };
}

describe("computeDiscoveryScheduleProjection", () => {
  it("manual closed → CLOSED", () => {
    const projection = computeDiscoveryScheduleProjection({
      business_hours_json: autoHoursJson({}),
      is_open: false,
      now: new Date("2026-08-23T05:00:00.000Z"),
    });
    expect(projection.discoveryScheduleState).toBe("CLOSED");
  });

  it("open within schedule → ORDERABLE", () => {
    const projection = computeDiscoveryScheduleProjection({
      business_hours_json: autoHoursJson({ open: "00:00", close: "23:59" }),
      is_open: true,
      now: new Date("2026-08-23T05:00:00.000Z"),
    });
    expect(projection.discoveryScheduleState).toBe("ORDERABLE");
  });

  it("break window → IN_BREAK", () => {
    const projection = computeDiscoveryScheduleProjection({
      business_hours_json: autoHoursJson({
        open: "00:00",
        close: "23:59",
        break: { start: "14:00", end: "15:00" },
      }),
      is_open: true,
      now: new Date("2026-08-23T06:30:00.000Z"),
    });
    expect(projection.discoveryScheduleState).toBe("IN_BREAK");
  });

  it("point commerce blocked → PREPARING", () => {
    const projection = computeDiscoveryScheduleProjection({
      business_hours_json: autoHoursJson({ open: "00:00", close: "23:59" }),
      is_open: true,
      point_commerce_blocked: true,
      now: new Date("2026-08-23T05:00:00.000Z"),
    });
    expect(projection.discoveryScheduleState).toBe("PREPARING");
  });

  it("sets next_schedule_transition_at in the future when boundaries exist", () => {
    const now = new Date("2026-08-23T01:00:00.000Z");
    const projection = computeDiscoveryScheduleProjection({
      business_hours_json: autoHoursJson({ open: "09:00", close: "22:00", timezone: "Asia/Manila" }),
      is_open: true,
      now,
    });
    expect(projection.nextScheduleTransitionAt).not.toBeNull();
    expect(Date.parse(projection.nextScheduleTransitionAt!)).toBeGreaterThan(now.getTime());
  });

  it("recomputes after settings edit input change", () => {
    const now = new Date("2026-08-23T05:00:00.000Z");
    const before = computeDiscoveryScheduleProjection({
      business_hours_json: autoHoursJson({ open: "00:00", close: "23:59" }),
      is_open: true,
      now,
    });
    const after = computeDiscoveryScheduleProjection({
      business_hours_json: autoHoursJson({ open: "00:00", close: "12:00" }),
      is_open: true,
      now,
    });
    expect(before.discoveryScheduleState).toBe("ORDERABLE");
    expect(after.discoveryScheduleState).toBe("CLOSED");
  });
});
