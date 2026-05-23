import { describe, expect, it } from "vitest";
import {
  openOwnerMobileOpsMenu,
  registerOwnerMobileOpsMenuOpen,
} from "@/lib/business/owner-mobile-ops-menu-bridge";

describe("owner-mobile-ops-menu-bridge", () => {
  it("등록 전에는 false, 등록 후 handler 호출", () => {
    let called = 0;
    registerOwnerMobileOpsMenuOpen(null);
    expect(openOwnerMobileOpsMenu()).toBe(false);

    registerOwnerMobileOpsMenuOpen(() => {
      called += 1;
    });
    expect(openOwnerMobileOpsMenu()).toBe(true);
    expect(called).toBe(1);

    registerOwnerMobileOpsMenuOpen(null);
    expect(openOwnerMobileOpsMenu()).toBe(false);
  });
});
