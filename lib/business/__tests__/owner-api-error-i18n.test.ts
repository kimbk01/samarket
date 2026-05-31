import { describe, expect, it } from "vitest";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import type { MessageKey } from "@/lib/i18n/messages";

const t = (key: MessageKey) => key;

describe("resolveOwnerApiErrorMessage owner review codes", () => {
  it("maps review load domain codes to catalog keys", () => {
    expect(resolveOwnerApiErrorMessage("load_failed", t)).toBe("business_phase7_353");
    expect(resolveOwnerApiErrorMessage("order_not_found", t)).toBe("store_owner_order_not_found");
    expect(resolveOwnerApiErrorMessage("unauthorized", t)).toBe("common_login_required");
    expect(resolveOwnerApiErrorMessage("network_error", t)).toBe("common_network_error");
  });
});
