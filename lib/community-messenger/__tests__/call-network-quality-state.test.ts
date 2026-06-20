import { describe, expect, it } from "vitest";
import { computeCallDisplayConnectionState } from "@/lib/community-messenger/call-network-quality-state";

const baseInput = {
  isTerminal: false,
  agoraReconnecting: false,
  joined: true,
  remoteJoined: true,
  sessionStatus: "active" as const,
  direction: "outgoing" as const,
  phase: "connected" as const,
  isVideoCall: false,
  uplinkQuality: 1,
  downlinkQuality: 1,
};

describe("call-network-quality-state", () => {
  it("returns unknown without warning border for terminal sessions", () => {
    const state = computeCallDisplayConnectionState({
      ...baseInput,
      isTerminal: true,
    });
    expect(state.level).toBe("unknown");
    expect(state.showWarningBorder).toBe(false);
    expect(state.warningClassName).toBeNull();
  });

  it("prioritizes reconnecting over quality metrics", () => {
    const state = computeCallDisplayConnectionState({
      ...baseInput,
      agoraReconnecting: true,
      uplinkQuality: 5,
      downlinkQuality: 5,
    });
    expect(state.level).toBe("reconnecting");
    expect(state.labelKey).toBe("cm_ui_call_reconnecting");
    expect(state.warningClassName).toBe("dibay-call-network-reconnecting");
    expect(state.showWarningBorder).toBe(true);
  });

  it("returns connecting before joined", () => {
    const state = computeCallDisplayConnectionState({
      ...baseInput,
      joined: false,
      remoteJoined: false,
      phase: "connecting",
    });
    expect(state.level).toBe("connecting");
    expect(state.labelKey).toBe("cm_ui_connection_connecting");
    expect(state.warningClassName).toBeNull();
  });

  it("returns outgoing ringing label while waiting for peer", () => {
    const state = computeCallDisplayConnectionState({
      ...baseInput,
      joined: false,
      remoteJoined: false,
      phase: "ringing",
      direction: "outgoing",
    });
    expect(state.labelKey).toBe("cm_ui_connection_calling_peer");
  });

  it("maps poor and lost quality to warning classes", () => {
    const poor = computeCallDisplayConnectionState({
      ...baseInput,
      uplinkQuality: 4,
      downlinkQuality: 2,
    });
    expect(poor.level).toBe("poor");
    expect(poor.warningClassName).toBe("dibay-call-network-poor");
    expect(poor.showWarningBorder).toBe(true);

    const lost = computeCallDisplayConnectionState({
      ...baseInput,
      uplinkQuality: 6,
      downlinkQuality: 1,
    });
    expect(lost.level).toBe("lost");
    expect(lost.warningClassName).toBe("dibay-call-network-lost");
  });

  it("returns fair without warning border", () => {
    const state = computeCallDisplayConnectionState({
      ...baseInput,
      uplinkQuality: 3,
      downlinkQuality: 3,
    });
    expect(state.level).toBe("fair");
    expect(state.labelKey).toBe("cm_ui_connection_status_fair");
    expect(state.showWarningBorder).toBe(false);
  });

  it("returns good/excellent without warning border", () => {
    const good = computeCallDisplayConnectionState({
      ...baseInput,
      uplinkQuality: 2,
      downlinkQuality: 2,
    });
    expect(good.level).toBe("good");
    expect(good.warningClassName).toBeNull();

    const excellent = computeCallDisplayConnectionState({
      ...baseInput,
      uplinkQuality: 1,
      downlinkQuality: 1,
    });
    expect(excellent.level).toBe("excellent");
    expect(excellent.showWarningBorder).toBe(false);
  });
});
