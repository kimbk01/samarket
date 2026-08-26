import { afterEach, describe, expect, it } from "vitest";
import {
  __resetGiftTransferUiStatusForTests,
  rememberGiftTransferUiStatus,
  resolveGiftTransferUiStatus,
} from "@/lib/gift-certificate/gift-transfer-ui-status";

describe("gift-transfer-ui-status (U3.1 accept readback)", () => {
  afterEach(() => {
    __resetGiftTransferUiStatusForTests();
  });

  it("T1: accept success remembers ACCEPTED over PENDING metadata", () => {
    const id = "transfer-t1";
    expect(resolveGiftTransferUiStatus(id, "PENDING")).toBe("PENDING");
    rememberGiftTransferUiStatus(id, "ACCEPTED");
    expect(resolveGiftTransferUiStatus(id, "PENDING")).toBe("ACCEPTED");
  });

  it("T2: remount with stale PENDING metadata still resolves ACCEPTED", () => {
    const id = "transfer-t2";
    rememberGiftTransferUiStatus(id, "ACCEPTED");
    expect(resolveGiftTransferUiStatus(id, "PENDING")).toBe("ACCEPTED");
  });

  it("T3: one remember call is enough (no second mutation needed for display)", () => {
    const id = "transfer-t3";
    rememberGiftTransferUiStatus(id, "ACCEPTED");
    expect(resolveGiftTransferUiStatus(id, "PENDING")).toBe("ACCEPTED");
    expect(resolveGiftTransferUiStatus(id, "PENDING")).toBe("ACCEPTED");
  });

  it("T4: ACCEPTED means accept CTA should hide (display gate)", () => {
    const id = "transfer-t4";
    rememberGiftTransferUiStatus(id, "ACCEPTED");
    const display = resolveGiftTransferUiStatus(id, "PENDING");
    const showAcceptCta = display === "PENDING";
    const showWalletCta = display === "ACCEPTED";
    expect(showAcceptCta).toBe(false);
    expect(showWalletCta).toBe(true);
  });
});
