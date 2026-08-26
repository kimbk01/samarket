import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GIFT_MIGRATION_ID, GIFT_RPCS } from "@/lib/gift-certificate/gift-certificate-schema";

describe("G3 gift certificate RPC names", () => {
  it("GIFT_RPCS values match migration function names", () => {
    const migrationPath = resolve(
      process.cwd(),
      `supabase/migrations/${GIFT_MIGRATION_ID}.sql`
    );
    const sql = readFileSync(migrationPath, "utf8");
    for (const fn of Object.values(GIFT_RPCS)) {
      expect(sql).toContain(`FUNCTION public.${fn}(`);
    }
  });
});
