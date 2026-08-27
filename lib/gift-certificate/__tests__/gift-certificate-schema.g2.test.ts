import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  GIFT_MIGRATION_ID,
  GIFT_ORDER_COMPLETION_REVENUE_MIGRATION_ID,
  GIFT_RECOGNITION_CORRECTION_MIGRATION_ID,
  GIFT_RPCS,
  GIFT_TABLES,
} from "@/lib/gift-certificate/gift-certificate-schema";
import {
  GIFT_INSTANCE_EXPIRY_DISABLED,
  GIFT_IS_NOT_COUPON,
  GIFT_FORBIDDEN_BALANCE_AUTHORITIES,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";

const MIG = readFileSync(
  resolve(process.cwd(), `supabase/migrations/${GIFT_MIGRATION_ID}.sql`),
  "utf8"
);
const MIG_ORDER_COMPLETION = readFileSync(
  resolve(process.cwd(), `supabase/migrations/${GIFT_ORDER_COMPLETION_REVENUE_MIGRATION_ID}.sql`),
  "utf8"
);
const MIG_RECOGNITION_CORRECTION = readFileSync(
  resolve(process.cwd(), `supabase/migrations/${GIFT_RECOGNITION_CORRECTION_MIGRATION_ID}.sql`),
  "utf8"
);

describe("G2 gift certificate schema migration", () => {
  it("creates all domain tables and forbids instance expires_at", () => {
    for (const t of Object.values(GIFT_TABLES)) {
      expect(MIG).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
    expect(MIG).toMatch(/gift_redemption_amount/);
    const createStart = MIG.indexOf(
      "CREATE TABLE IF NOT EXISTS public.gift_certificate_instances"
    );
    const createEnd = MIG.indexOf(");", createStart) + 2;
    const instCreate = MIG.slice(createStart, createEnd);
    expect(instCreate).not.toMatch(/\bexpires_at\b/);
    expect(GIFT_INSTANCE_EXPIRY_DISABLED).toBe(true);
  });

  it("defines money RPCs as service_role only and separates coupon/credit/settlement", () => {
    const orderCompletionRpcs = new Set<string>([
      GIFT_RPCS.recognizeRevenueForCompletedOrder,
      GIFT_RPCS.redemptionIsRecognized,
    ]);
    const recognitionCorrectionRpcs = new Set<string>([
      GIFT_RPCS.redemptionRecognizedNet,
      GIFT_RPCS.correctLegacyRecognition,
    ]);
    const g2Rpcs = Object.values(GIFT_RPCS).filter(
      (fn) =>
        fn !== "gift_certificate_refund_order_atomic" &&
        !orderCompletionRpcs.has(fn) &&
        !recognitionCorrectionRpcs.has(fn)
    );
    for (const rpc of g2Rpcs) {
      expect(MIG).toContain(`CREATE OR REPLACE FUNCTION public.${rpc}`);
      expect(MIG).toContain(`GRANT EXECUTE ON FUNCTION public.${rpc}`);
    }
    for (const rpc of orderCompletionRpcs) {
      expect(MIG_ORDER_COMPLETION).toContain(`CREATE OR REPLACE FUNCTION public.${rpc}`);
      expect(MIG_ORDER_COMPLETION).toContain(`GRANT EXECUTE ON FUNCTION public.${rpc}`);
    }
    for (const rpc of recognitionCorrectionRpcs) {
      expect(MIG_RECOGNITION_CORRECTION).toContain(`CREATE OR REPLACE FUNCTION public.${rpc}`);
      expect(MIG_RECOGNITION_CORRECTION).toContain(`GRANT EXECUTE ON FUNCTION public.${rpc}`);
    }
    expect(MIG).toMatch(/service_role/);
    expect(MIG).not.toMatch(/store_coupon_campaigns/);
    expect(GIFT_IS_NOT_COUPON).toBe(true);
    expect(GIFT_FORBIDDEN_BALANCE_AUTHORITIES).toContain("stores.point_balance");
    expect(GIFT_FORBIDDEN_BALANCE_AUTHORITIES).toContain("store_settlements");
  });

  it("enforces pending transfer uniqueness and integer remaining_balance", () => {
    expect(MIG).toMatch(/gift_certificate_transfers_one_pending/);
    expect(MIG).toMatch(/remaining_balance integer/);
    expect(MIG).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });
});
