import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GIFT_RPCS } from "@/lib/gift-certificate/gift-certificate-schema";

describe("CUT 2 cancel gift restore contract", () => {
  const mig = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20270101130000_gift_certificate_cancel_order_restore.sql"),
    "utf8"
  );
  const transition = readFileSync(
    resolve(process.cwd(), "lib/stores/apply-store-order-status-transition.ts"),
    "utf8"
  );
  const buyerRoute = readFileSync(
    resolve(process.cwd(), "app/api/me/store-orders/[orderId]/route.ts"),
    "utf8"
  );

  it("defines cancel restore RPC that reuses redemption_reverse without refunded write", () => {
    expect(GIFT_RPCS.cancelOrderRestore).toBe("gift_certificate_cancel_order_restore");
    expect(mig).toMatch(/CREATE OR REPLACE FUNCTION public\.gift_certificate_cancel_order_restore/);
    expect(mig).toMatch(/gift_certificate_redemption_reverse\(p_order_id\)/);
    expect(mig).not.toMatch(/order_status\s*=\s*'refunded'/);
  });

  it("apply cancel path uses cancel restore RPC not direct reverse", () => {
    expect(transition).toMatch(/gift_certificate_cancel_order_restore/);
    expect(transition).not.toMatch(/gift_certificate_redemption_reverse/);
  });

  it("buyer API remains pending-only", () => {
    expect(buyerRoute).toMatch(/order_status !== "pending"/);
    expect(buyerRoute).toMatch(/cannot_cancel_after_accepted/);
  });
});
