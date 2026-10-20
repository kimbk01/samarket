import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatAdminHeaderClock,
  formatAdminManilaDate,
  formatAdminManilaDateTime,
  manilaTodayStartUtcIso,
} from "@/lib/admin/metrics/manila-period";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Admin Manila (PHT) formatters — 설계 v4 §6", () => {
  it("formatAdminManilaDate: UTC 날짜와 PHT 날짜가 갈리는 경계(16:00Z)", () => {
    expect(formatAdminManilaDate("2026-10-19T15:59:00Z")).toBe("2026-10-19");
    expect(formatAdminManilaDate("2026-10-19T16:00:00Z")).toBe("2026-10-20");
    expect(formatAdminManilaDate(new Date("2026-10-19T23:59:00Z"))).toBe("2026-10-20");
    expect(formatAdminManilaDate(Date.parse("2026-12-31T16:30:00Z"))).toBe("2027-01-01");
    expect(formatAdminManilaDate(null)).toBe("—");
    expect(formatAdminManilaDate("not-a-date")).toBe("—");
  });

  it("formatAdminManilaDateTime: YYYY-MM-DD HH:mm (PHT)", () => {
    expect(formatAdminManilaDateTime("2026-10-20T09:27:00Z")).toBe("2026-10-20 17:27");
    expect(formatAdminManilaDateTime("2026-10-19T16:05:00Z")).toBe("2026-10-20 00:05");
    expect(formatAdminManilaDateTime(undefined)).toBe("—");
  });

  it("formatAdminHeaderClock: 「2026-10-20 (화) 17:27 PHT」 ko/en", () => {
    const at = new Date("2026-10-20T09:27:30Z");
    expect(formatAdminHeaderClock(at, "ko")).toBe("2026-10-20 (화) 17:27 PHT");
    expect(formatAdminHeaderClock(at, "en")).toBe("2026-10-20 (Tue) 17:27 PHT");
    // UTC 월요일 16:30 = PHT 화요일 00:30
    expect(formatAdminHeaderClock(new Date("2026-10-19T16:30:00Z"), "ko")).toBe("2026-10-20 (화) 00:30 PHT");
    expect(formatAdminHeaderClock(new Date("2026-10-19T15:30:00Z"), "en")).toBe("2026-10-19 (Mon) 23:30 PHT");
  });

  it("manilaTodayStartUtcIso: 마닐라 자정 = 전날 16:00Z", () => {
    expect(manilaTodayStartUtcIso(new Date("2026-10-19T16:30:00Z"))).toBe("2026-10-19T16:00:00.000Z");
    expect(manilaTodayStartUtcIso(new Date("2026-10-19T15:30:00Z"))).toBe("2026-10-18T16:00:00.000Z");
  });
});

describe("V3-13 / V3-14 「오늘」 = 마닐라 자정 (서버 TZ 자정 금지)", () => {
  for (const rel of [
    "lib/admin-dashboard/build-admin-dashboard-payload.ts",
    "app/api/admin/delivery-operation-alerts/route.ts",
  ]) {
    it(rel, () => {
      const src = read(rel);
      expect(src).toContain("manilaTodayStartUtcIso(");
      expect(src).not.toMatch(/setHours\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/);
    });
  }
});
