import { describe, expect, it } from "vitest";
import {
  canCleanupActiveCall,
  canTransitionMachinePhase,
  isConnectedKeepAlivePhase,
  isForbiddenCleanupReason,
  mapLegacyPhaseToMachine,
  mapMachinePhaseToLegacy,
  transitionMachinePhase,
} from "@/lib/call/active-call-session-machine";

describe("active-call-session-machine", () => {
  it("blocks forbidden cleanup reasons", () => {
    expect(canCleanupActiveCall("activity_destroyed")).toBe(false);
    expect(canCleanupActiveCall("webview_reload")).toBe(false);
    expect(canCleanupActiveCall("notification_dismissed")).toBe(false);
    expect(canCleanupActiveCall("screen_off")).toBe(false);
    expect(canCleanupActiveCall("backgrounded")).toBe(false);
    expect(canCleanupActiveCall("app_swipe")).toBe(false);
    expect(isForbiddenCleanupReason("unknown")).toBe(true);
  });

  it("allows terminal cleanup reasons", () => {
    expect(canCleanupActiveCall("local_ended")).toBe(true);
    expect(canCleanupActiveCall("remote_ended")).toBe(true);
    expect(canCleanupActiveCall("heartbeat_timeout")).toBe(true);
    expect(canCleanupActiveCall("media_failed_after_connected")).toBe(true);
  });

  it("connected → background/screen_off stays in keep-alive family", () => {
    expect(canTransitionMachinePhase("CONNECTED", "BACKGROUNDED")).toBe(true);
    expect(canTransitionMachinePhase("CONNECTED", "SCREEN_OFF_ACTIVE")).toBe(true);
    expect(isConnectedKeepAlivePhase("BACKGROUNDED")).toBe(true);
    expect(isConnectedKeepAlivePhase("SCREEN_OFF_ACTIVE")).toBe(true);
  });

  it("reconnecting is not terminal", () => {
    expect(transitionMachinePhase("CONNECTED", "RECONNECTING")).toBe("RECONNECTING");
    expect(mapMachinePhaseToLegacy("RECONNECTING")).toBe("active");
  });

  it("maps legacy active+joined to CONNECTED", () => {
    expect(mapLegacyPhaseToMachine("active", true)).toBe("CONNECTED");
    expect(mapLegacyPhaseToMachine("connecting", false)).toBe("ACCEPTED");
  });

  it("remote ended idempotent transition to CLEANED", () => {
    expect(canTransitionMachinePhase("REMOTE_ENDED", "CLEANED")).toBe(true);
    expect(canTransitionMachinePhase("REMOTE_ENDED", "CONNECTED")).toBe(false);
  });
});
