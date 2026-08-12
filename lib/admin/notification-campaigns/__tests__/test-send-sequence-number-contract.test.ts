import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getNextOccurrenceSequenceNumber } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";

/** PostgreSQL `integer` / int4 upper bound. */
const PG_INT4_MAX = 2_147_483_647;

describe("test-send occurrence sequenceNumber integer contract", () => {
  it("route uses getNextOccurrenceSequenceNumber and never Date.now() as sequence", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/admin/notification-campaigns/[campaignId]/test-send/route.ts"),
      "utf8"
    );
    expect(src).toMatch(/getNextOccurrenceSequenceNumber\s*\(/);
    expect(src).not.toMatch(/sequenceNumber\s*=\s*Date\.now\s*\(/);
    expect(src).not.toMatch(/sequence_number\s*:\s*Date\.now\s*\(/);
    expect(src).not.toMatch(/p_sequence_number\s*:\s*Date\.now\s*\(/);
  });

  it("Date.now() epoch ms exceeds PostgreSQL integer (must not be used as sequence)", () => {
    expect(Date.now()).toBeGreaterThan(PG_INT4_MAX);
  });

  it("getNextOccurrenceSequenceNumber returns compact int within int4", async () => {
    const svc = {
      from() {
        return this;
      },
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return this;
      },
      async maybeSingle() {
        return { data: { sequence_number: 41 } };
      },
    };
    const n = await getNextOccurrenceSequenceNumber(svc as never, "camp-id");
    expect(n).toBe(42);
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(PG_INT4_MAX);
  });
});
