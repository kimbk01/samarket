import { describe, expect, it } from "vitest";
import { computeNextRecurrenceScheduledFor } from "@/lib/admin/notification-campaigns/campaign-recurrence";

/** 재감사 2026-11-02 S2 — 반복 발송 시각·요일은 PHT(Asia/Manila) 기준이다. */
const pht = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).format(new Date(iso));

describe("campaign recurrence in PHT", () => {
  it("daily 18:00 PHT = same day 10:00 UTC (not the next day)", () => {
    const next = computeNextRecurrenceScheduledFor(
      { kind: "daily", timeLocal: "18:00", timezone: "Asia/Manila", startAt: "2026-11-02T00:00:00Z" },
      new Date("2026-11-02T01:00:00Z"),
      1
    );
    expect(next?.toISOString()).toBe("2026-11-02T10:00:00.000Z");
  });

  it("daily 02:00 PHT after 03:00 PHT = next day 02:00 PHT", () => {
    const next = computeNextRecurrenceScheduledFor(
      { kind: "daily", timeLocal: "02:00", timezone: "Asia/Manila", startAt: "2026-11-01T00:00:00Z" },
      new Date("2026-11-01T19:00:00Z"), // 11-02 03:00 PHT
      1
    );
    expect(next?.toISOString()).toBe("2026-11-02T18:00:00.000Z"); // 11-03 02:00 PHT
  });

  it("weekly Tuesday 07:00 PHT lands on Tuesday in PHT (UTC is Monday 23:00)", () => {
    const next = computeNextRecurrenceScheduledFor(
      { kind: "weekly", weekday: 2, timeLocal: "07:00", timezone: "Asia/Manila", startAt: "2026-11-02T00:00:00Z" },
      new Date("2026-11-02T00:00:00Z"), // 11-02 (Mon) 08:00 PHT
      1
    );
    expect(next?.toISOString()).toBe("2026-11-02T23:00:00.000Z");
    expect(pht(next!.toISOString())).toContain("Tue");
  });

  it("weekly Tuesday 20:00 PHT", () => {
    const next = computeNextRecurrenceScheduledFor(
      { kind: "weekly", weekday: 2, timeLocal: "20:00", timezone: "Asia/Manila", startAt: "2026-11-02T00:00:00Z" },
      new Date("2026-11-02T00:00:00Z"),
      1
    );
    expect(next?.toISOString()).toBe("2026-11-03T12:00:00.000Z");
    expect(pht(next!.toISOString())).toContain("Tue");
  });
});
