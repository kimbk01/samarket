import { describe, expect, it } from "vitest";
import {
  OWNER_SELF_ISSUED_FUNDING_FORBIDDEN,
  resolveOwnerSelfIssuedCreateFunding,
} from "@/lib/stores/store-coupon-ssot";

describe("CUT UI-0 Owner self-issued funding authority", () => {
  it("omit funding → STORE_FUNDED write, no admin approval, no store share", () => {
    const r = resolveOwnerSelfIssuedCreateFunding({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.write.funding_mode).toBe("STORE_FUNDED");
    expect(r.write.requires_admin_approval).toBe(false);
    expect(r.write.store_funded_amount).toBeNull();
  });

  it("STORE_FUNDED → STORE_FUNDED write", () => {
    const r = resolveOwnerSelfIssuedCreateFunding({ fundingMode: "STORE_FUNDED" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.write).toEqual({
      funding_mode: "STORE_FUNDED",
      requires_admin_approval: false,
      store_funded_amount: null,
    });
  });

  it("STORE_FUNDED via funding_mode + storeFundedAmount still cannot author SHARED share", () => {
    const r = resolveOwnerSelfIssuedCreateFunding({
      funding_mode: "STORE_FUNDED",
      storeFundedAmount: 60,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.write.store_funded_amount).toBeNull();
  });

  it("PLATFORM_FUNDED → forbidden (HTTP 400 / INSERT NONE)", () => {
    const r = resolveOwnerSelfIssuedCreateFunding({ fundingMode: "PLATFORM_FUNDED" });
    expect(r).toEqual({ ok: false, error: OWNER_SELF_ISSUED_FUNDING_FORBIDDEN });
  });

  it("SHARED_FUNDED → forbidden", () => {
    const r = resolveOwnerSelfIssuedCreateFunding({ funding_mode: "SHARED_FUNDED" });
    expect(r).toEqual({ ok: false, error: OWNER_SELF_ISSUED_FUNDING_FORBIDDEN });
  });

  it("arbitrary/non-STORE → forbidden", () => {
    const r = resolveOwnerSelfIssuedCreateFunding({ fundingMode: "TAMPERED" });
    expect(r).toEqual({ ok: false, error: OWNER_SELF_ISSUED_FUNDING_FORBIDDEN });
  });
});
