import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertBadgeNativeIdentityWires } from "@/lib/notifications/badge-native-runtime-identity";

describe("badge axis Native single-writer contract (Phase 5)", () => {
  it("native identity wires echo appIconTotal only", () => {
    const r = assertBadgeNativeIdentityWires();
    expect(r.ok, r.errors.join("\n")).toBe(true);
  });

  it("NativeBadgeSync is sole Cap entry from Projection surface", () => {
    const sync = readFileSync(join(process.cwd(), "components/push/NativeBadgeSync.tsx"), "utf8");
    const bridge = readFileSync(
      join(process.cwd(), "lib/messenger/contracts/domain-badge-authority-product-bridge.ts"),
      "utf8"
    );
    expect(sync).toContain("getDomainBadgeSurfaceSnapshot");
    expect(sync).toContain("syncNativeBadgeCount");
    expect(sync).not.toContain("bellTotal");
    expect(bridge).toContain("publishDomainAppIconCompleteSnapshot");
    expect(bridge).toContain("NativeBadgeSync");
  });

  it("syncNativeBadgeCount applies Cap + DeliveryAdapter with same absolute count", () => {
    const src = readFileSync(join(process.cwd(), "lib/push/native/sync-native-badge-count.ts"), "utf8");
    expect(src).toContain("Badge.set");
    expect(src).toContain("DibayAppIconDelivery.apply");
    expect(src).toContain("never Bell");
    expect(src).toContain("never +1");
  });
});
