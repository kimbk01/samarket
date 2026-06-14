import { describe, expect, it } from "vitest";
import { resolveMainHubPtrDomain } from "@/lib/layout/resolve-main-hub-ptr-domain";

describe("resolveMainHubPtrDomain", () => {
  it("returns single domain per pathname", () => {
    expect(resolveMainHubPtrDomain("/philife")).toBe("philife");
    expect(resolveMainHubPtrDomain("/market")).toBe("trade");
    expect(resolveMainHubPtrDomain("/stores")).toBe("stores");
  });

  it("returns null for browse and unsupported paths", () => {
    expect(resolveMainHubPtrDomain("/stores/browse/restaurant")).toBe(null);
    expect(resolveMainHubPtrDomain("/market/trade-meet-spot")).toBe(null);
    expect(resolveMainHubPtrDomain("/mypage")).toBe(null);
  });
});
