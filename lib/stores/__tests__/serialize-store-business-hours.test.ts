import { describe, expect, it } from "vitest";
import {
  applyAutoBusinessHoursToRecord,
  sanitizeBusinessHoursJsonForPersistence,
} from "@/lib/stores/serialize-store-business-hours-json";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";

describe("sanitizeBusinessHoursJsonForPersistence", () => {
  it("legacy enabled:true 단독 → schedule_enforced false 로 정규화", () => {
    const out = sanitizeBusinessHoursJsonForPersistence({
      auto_business_hours: {
        enabled: true,
        timezone: "Asia/Manila",
        open: "09:00",
        close: "22:00",
      },
    });
    const a = out.auto_business_hours as Record<string, unknown>;
    expect(a.enabled).toBe(false);
    expect(a.schedule_enforced).toBe(false);
    expect(a.open).toBe("09:00");
    const at3am = new Date("2026-05-23T03:00:00+08:00");
    expect(resolveStoreFrontOpen(out, true, at3am)).toBe(true);
  });

  it("enabled + schedule_enforced true 는 유지", () => {
    const out = sanitizeBusinessHoursJsonForPersistence({
      auto_business_hours: {
        enabled: true,
        schedule_enforced: true,
        timezone: "Asia/Manila",
        open: "09:00",
        close: "22:00",
      },
    });
    const a = out.auto_business_hours as Record<string, unknown>;
    expect(a.enabled).toBe(true);
    expect(a.schedule_enforced).toBe(true);
    const at3am = new Date("2026-05-23T03:00:00+08:00");
    expect(resolveStoreFrontOpen(out, true, at3am)).toBe(false);
  });

  it("apply + sanitize 라운드트립 — 폼 OFF 후 공개 열림", () => {
    const prev: Record<string, unknown> = {};
    applyAutoBusinessHoursToRecord(prev, {
      autoBusinessHoursEnabled: false,
      autoHoursTz: "Asia/Manila",
      autoHoursOpen: "09:00",
      autoHoursClose: "22:00",
    });
    const persisted = sanitizeBusinessHoursJsonForPersistence(prev);
    const at3am = new Date("2026-05-23T03:00:00+08:00");
    expect(resolveStoreFrontOpen(persisted, true, at3am)).toBe(true);
  });
});
