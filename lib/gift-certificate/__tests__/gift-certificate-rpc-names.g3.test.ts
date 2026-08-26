import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIFT_CHECKOUT_REFUND_MIGRATION_ID,
  GIFT_MIGRATION_ID,
  GIFT_RPCS,
} from "@/lib/gift-certificate/gift-certificate-schema";

describe("G3 gift certificate RPC names", () => {
  it("GIFT_RPCS values match G2 or checkout/refund migration function names", () => {
    const g2 = readFileSync(
      resolve(process.cwd(), `supabase/migrations/${GIFT_MIGRATION_ID}.sql`),
      "utf8"
    );
    const g7 = readFileSync(
      resolve(process.cwd(), `supabase/migrations/${GIFT_CHECKOUT_REFUND_MIGRATION_ID}.sql`),
      "utf8"
    );
    for (const fn of Object.values(GIFT_RPCS)) {
      expect(g2.includes(`FUNCTION public.${fn}(`) || g7.includes(`FUNCTION public.${fn}(`)).toBe(
        true
      );
    }
  });
});
