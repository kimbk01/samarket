import { describe, expect, it } from "vitest";
import {
  readAutoBusinessHoursEnabled,
  resolveStoreFrontOpen,
} from "@/lib/stores/store-auto-hours";
import { applyAutoBusinessHoursToRecord } from "@/lib/stores/serialize-store-business-hours-json";

describe("store-auto-hours", () => {
  it("enabled false 이면 영업시간 밖에도 is_open true 면 주문 가능", () => {
    const json = {
      auto_business_hours: {
        enabled: false,
        schedule_enforced: false,
        timezone: "Asia/Manila",
        open: "09:00",
        close: "22:00",
      },
    };
    expect(readAutoBusinessHoursEnabled(json)).toBe(false);
    const at3am = new Date("2026-05-23T03:00:00+08:00");
    expect(resolveStoreFrontOpen(json, true, at3am)).toBe(true);
  });

  it("legacy: enabled true 만 있고 schedule_enforced 없으면 스케줄 미적용(열림)", () => {
    const json = {
      auto_business_hours: {
        enabled: true,
        timezone: "Asia/Manila",
        open: "09:00",
        close: "22:00",
      },
    };
    expect(readAutoBusinessHoursEnabled(json)).toBe(false);
    const at3am = new Date("2026-05-23T03:00:00+08:00");
    expect(resolveStoreFrontOpen(json, true, at3am)).toBe(true);
  });

  it("schedule_enforced true 이면 스케줄 밖은 마감", () => {
    const json = {
      auto_business_hours: {
        enabled: true,
        schedule_enforced: true,
        timezone: "Asia/Manila",
        open: "09:00",
        close: "22:00",
      },
    };
    expect(readAutoBusinessHoursEnabled(json)).toBe(true);
    const at3am = new Date("2026-05-23T03:00:00+08:00");
    expect(resolveStoreFrontOpen(json, true, at3am)).toBe(false);
    const atNoon = new Date("2026-05-23T12:00:00+08:00");
    expect(resolveStoreFrontOpen(json, true, atNoon)).toBe(true);
  });

  it("is_open false 면 자동 on 이어도 마감", () => {
    const json = {
      auto_business_hours: {
        enabled: true,
        schedule_enforced: true,
        timezone: "Asia/Manila",
        open: "09:00",
        close: "22:00",
      },
    };
    const atNoon = new Date("2026-05-23T12:00:00+08:00");
    expect(resolveStoreFrontOpen(json, false, atNoon)).toBe(false);
  });
});

describe("applyAutoBusinessHoursToRecord", () => {
  it("자동 OFF 저장 시 schedule_enforced false, 시각 보존", () => {
    const prev: Record<string, unknown> = {};
    applyAutoBusinessHoursToRecord(prev, {
      autoBusinessHoursEnabled: false,
      autoHoursTz: "Asia/Manila",
      autoHoursOpen: "09:00",
      autoHoursClose: "22:00",
    });
    const a = prev.auto_business_hours as Record<string, unknown>;
    expect(a.enabled).toBe(false);
    expect(a.schedule_enforced).toBe(false);
    expect(a.open).toBe("09:00");
    expect(a.close).toBe("22:00");
  });

  it("자동 ON 저장 시 schedule_enforced true", () => {
    const prev: Record<string, unknown> = {};
    applyAutoBusinessHoursToRecord(prev, {
      autoBusinessHoursEnabled: true,
      autoHoursTz: "Asia/Manila",
      autoHoursOpen: "09:00",
      autoHoursClose: "22:00",
    });
    const a = prev.auto_business_hours as Record<string, unknown>;
    expect(a.enabled).toBe(true);
    expect(a.schedule_enforced).toBe(true);
    expect(prev.weekdays).toContain("09:00");
  });
});
