import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

describe("Phase C1 store-commerce-minute-tick", () => {
  it("vercel schedules one minute tick and drops the three old 1-min paths", () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const minute = vercel.crons.filter((c) => c.schedule === "* * * * *");
    expect(minute.map((c) => c.path)).toEqual(["/api/cron/store-commerce-minute-tick"]);
    const paths = new Set(vercel.crons.map((c) => c.path));
    expect(paths.has("/api/cron/store-order-accept-reminders")).toBe(false);
    expect(paths.has("/api/cron/store-orders-accept-timeout")).toBe(false);
    expect(paths.has("/api/cron/notification-push-handoff")).toBe(false);
  });

  it("probeStoreAcceptAutomationDue fail-open on select error", async () => {
    const { probeStoreAcceptAutomationDue } = await import(
      "@/lib/cron/store-commerce-minute-tick.server"
    );
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => ({
                  limit: async () => ({ data: null, error: { message: "x" } }),
                }),
              }),
            }),
          }),
        }),
      }),
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(probeStoreAcceptAutomationDue(sb as never)).resolves.toBe(true);
    spy.mockRestore();
  });

  it("probe returns false when no pending older than 30s", async () => {
    const { probeStoreAcceptAutomationDue } = await import(
      "@/lib/cron/store-commerce-minute-tick.server"
    );
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    };
    await expect(probeStoreAcceptAutomationDue(sb as never)).resolves.toBe(false);
  });
});
