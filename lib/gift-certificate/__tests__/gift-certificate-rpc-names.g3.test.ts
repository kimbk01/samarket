import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIFT_CASH_OUT_MIGRATION_ID,
  GIFT_CHECKOUT_REFUND_MIGRATION_ID,
  GIFT_MIGRATION_ID,
  GIFT_ORDER_COMPLETION_REVENUE_MIGRATION_ID,
  GIFT_RECOGNITION_CORRECTION_MIGRATION_ID,
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
    const g8 = readFileSync(
      resolve(process.cwd(), `supabase/migrations/${GIFT_ORDER_COMPLETION_REVENUE_MIGRATION_ID}.sql`),
      "utf8"
    );
    const g9 = readFileSync(
      resolve(process.cwd(), `supabase/migrations/${GIFT_RECOGNITION_CORRECTION_MIGRATION_ID}.sql`),
      "utf8"
    );
    const cashOut = readFileSync(
      resolve(process.cwd(), `supabase/migrations/${GIFT_CASH_OUT_MIGRATION_ID}.sql`),
      "utf8"
    );
    for (const fn of Object.values(GIFT_RPCS)) {
      expect(
        g2.includes(`FUNCTION public.${fn}(`) ||
          g7.includes(`FUNCTION public.${fn}(`) ||
          g8.includes(`FUNCTION public.${fn}(`) ||
          g9.includes(`FUNCTION public.${fn}(`) ||
          cashOut.includes(`FUNCTION public.${fn}(`)
      ).toBe(true);
    }
  });
});
