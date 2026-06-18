import { describe, expect, it } from "vitest";
import {
  canCleanupActiveCall,
  isConnectedKeepAlivePhase,
  mapMachinePhaseToLegacy,
} from "@/lib/call/active-call-session-machine";

type MatrixCase = {
  name: string;
  phase: string;
  event: string;
  expectLive: boolean;
  expectCleanupAllowed: boolean;
};

const MATRIX: MatrixCase[] = [
  { name: "screen off keep alive", phase: "SCREEN_OFF_ACTIVE", event: "screen_off", expectLive: true, expectCleanupAllowed: false },
  { name: "background keep alive", phase: "BACKGROUNDED", event: "backgrounded", expectLive: true, expectCleanupAllowed: false },
  { name: "activity destroy blocked", phase: "CONNECTED", event: "activity_destroyed", expectLive: true, expectCleanupAllowed: false },
  { name: "webview reload blocked", phase: "CONNECTED", event: "webview_reload", expectLive: true, expectCleanupAllowed: false },
  { name: "local end allowed", phase: "CONNECTED", event: "local_ended", expectLive: false, expectCleanupAllowed: true },
  { name: "remote end allowed", phase: "CONNECTED", event: "remote_ended", expectLive: false, expectCleanupAllowed: true },
  { name: "reconnecting not ended", phase: "RECONNECTING", event: "network", expectLive: true, expectCleanupAllowed: true },
  { name: "camera pause not end", phase: "BACKGROUNDED", event: "camera_pause", expectLive: true, expectCleanupAllowed: true },
];

describe("active call lifecycle matrix", () => {
  for (const row of MATRIX) {
    it(row.name, () => {
      if (row.expectLive) {
        expect(isConnectedKeepAlivePhase(row.phase as never)).toBe(true);
        expect(mapMachinePhaseToLegacy(row.phase as never)).toBe("active");
      }
      if (["activity_destroyed", "webview_reload", "screen_off", "backgrounded", "app_swipe"].includes(row.event)) {
        expect(canCleanupActiveCall(row.event)).toBe(row.expectCleanupAllowed);
      }
    });
  }
});
