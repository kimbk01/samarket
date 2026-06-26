import { describe, expect, it, vi } from "vitest";
import {
  callV4ConnectionSignalTierMessageKey,
  resolveCallV4ConnectionSignalTier,
} from "@/lib/community-messenger/call-v4/call-v4-network-quality";

describe("resolveCallV4ConnectionSignalTier", () => {
  it("maps Agora quality to 3-tier signal labels", () => {
    expect(resolveCallV4ConnectionSignalTier(1, 1)).toBe("good");
    expect(resolveCallV4ConnectionSignalTier(2, 1)).toBe("good");
    expect(resolveCallV4ConnectionSignalTier(3, 2)).toBe("fair");
    expect(resolveCallV4ConnectionSignalTier(4, 3)).toBe("poor");
    expect(resolveCallV4ConnectionSignalTier(6, 5)).toBe("poor");
  });

  it("returns checking while quality is unknown", () => {
    expect(resolveCallV4ConnectionSignalTier(0, 0)).toBe("checking");
  });

  it("uses worst of uplink and downlink", () => {
    expect(resolveCallV4ConnectionSignalTier(1, 5)).toBe("poor");
  });
});

describe("callV4ConnectionSignalTierMessageKey", () => {
  it("maps tiers to connection status i18n keys", () => {
    expect(callV4ConnectionSignalTierMessageKey("good")).toBe("cm_ui_connection_status_good");
    expect(callV4ConnectionSignalTierMessageKey("fair")).toBe("cm_ui_connection_status_fair");
    expect(callV4ConnectionSignalTierMessageKey("poor")).toBe("cm_ui_connection_status_poor");
    expect(callV4ConnectionSignalTierMessageKey("checking")).toBe("cm_ui_network_quality_checking");
  });
});
