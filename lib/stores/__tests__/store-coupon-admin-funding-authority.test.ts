import { describe, expect, it } from "vitest";
import {
  ADMIN_SHARED_SHARE_REQUIRED,
  ADMIN_SUPPORTED_FUNDING_FORBIDDEN,
  OWNER_SELF_ISSUED_FUNDING_FORBIDDEN,
  resolveAdminSupportedCreateFunding,
  resolveOwnerSelfIssuedCreateFunding,
} from "@/lib/stores/store-coupon-ssot";

describe("CUT UI-6 Admin-supported funding authority", () => {
  it("PLATFORM_FUNDED write, no store share", () => {
    const r = resolveAdminSupportedCreateFunding({ fundingMode: "PLATFORM_FUNDED" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.write).toEqual({
      funding_mode: "PLATFORM_FUNDED",
      requires_admin_approval: false,
      store_funded_amount: null,
    });
  });

  it("SHARED_FUNDED writes policy store share", () => {
    const r = resolveAdminSupportedCreateFunding({
      fundingMode: "SHARED_FUNDED",
      storeFundedAmount: 60,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.write).toEqual({
      funding_mode: "SHARED_FUNDED",
      requires_admin_approval: false,
      store_funded_amount: 60,
    });
  });

  it("SHARED without share fails", () => {
    const r = resolveAdminSupportedCreateFunding({ funding_mode: "SHARED_FUNDED" });
    expect(r).toEqual({ ok: false, error: ADMIN_SHARED_SHARE_REQUIRED });
  });

  it("STORE / omit / tamper forbidden on Admin resolver", () => {
    expect(resolveAdminSupportedCreateFunding({})).toEqual({
      ok: false,
      error: ADMIN_SUPPORTED_FUNDING_FORBIDDEN,
    });
    expect(resolveAdminSupportedCreateFunding({ fundingMode: "STORE_FUNDED" })).toEqual({
      ok: false,
      error: ADMIN_SUPPORTED_FUNDING_FORBIDDEN,
    });
    expect(resolveAdminSupportedCreateFunding({ fundingMode: "TAMPERED" })).toEqual({
      ok: false,
      error: ADMIN_SUPPORTED_FUNDING_FORBIDDEN,
    });
  });

  it("Owner resolver still forbids PLATFORM/SHARED", () => {
    expect(resolveOwnerSelfIssuedCreateFunding({ fundingMode: "PLATFORM_FUNDED" })).toEqual({
      ok: false,
      error: OWNER_SELF_ISSUED_FUNDING_FORBIDDEN,
    });
    expect(resolveOwnerSelfIssuedCreateFunding({ funding_mode: "SHARED_FUNDED" })).toEqual({
      ok: false,
      error: OWNER_SELF_ISSUED_FUNDING_FORBIDDEN,
    });
  });
});
