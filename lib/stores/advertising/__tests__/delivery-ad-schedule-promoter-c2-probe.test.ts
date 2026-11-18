import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Phase C2 delivery-ads promoter probe", () => {
  it("cron route probes before promoter batch", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/cron/delivery-ads-schedule-transitions/route.ts"),
      "utf8"
    );
    expect(src).toContain("probeDeliveryAdSchedulePromoterDue");
    expect(src.indexOf("probeDeliveryAdSchedulePromoterDue")).toBeLessThan(
      src.indexOf("runDeliveryAdSchedulePromoterBatch")
    );
  });

  it("exports probeDeliveryAdSchedulePromoterDue", async () => {
    const mod = await import("@/lib/stores/advertising/delivery-ad-schedule-promoter");
    expect(typeof mod.probeDeliveryAdSchedulePromoterDue).toBe("function");
  });
});
