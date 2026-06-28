import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/call/native/native-outgoing-bridge", () => ({
  isNativeEstablishmentOwned: vi.fn(async () => false),
}));

vi.mock("@/lib/call/native/native-call-service", () => ({
  readNativeActiveCallSnapshot: vi.fn(async () => null),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => true,
  resolveCapacitorShellPlatform: () => "android",
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-surface", () => ({
  getCallV4PersistedSurfaceOwner: vi.fn(() => "none"),
  isCallV4NativePersistedSurfaceOwner: vi.fn(() => false),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-store", () => ({
  readCallV4Identity: vi.fn(() => null),
  readCallV4Phase: vi.fn(() => "idle"),
}));

import { readNativeActiveCallSnapshot } from "@/lib/call/native/native-call-service";
import { isNativeEstablishmentOwned } from "@/lib/call/native/native-outgoing-bridge";
import {
  evaluateAuxiliaryNativeOwnedWebV4UiBlock,
  peekNativeOwnedWebV4UiBlockSync,
  resolveNativeOwnedWebV4UiBlock,
} from "@/lib/call/native/native-owned-web-v4-ui-guard";
import {
  getCallV4PersistedSurfaceOwner,
  isCallV4NativePersistedSurfaceOwner,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { readCallV4Identity, readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("native-owned-web-v4-ui-guard", () => {
  beforeEach(() => {
    vi.mocked(isNativeEstablishmentOwned).mockReset();
    vi.mocked(isNativeEstablishmentOwned).mockResolvedValue(false);
    vi.mocked(readNativeActiveCallSnapshot).mockReset();
    vi.mocked(readNativeActiveCallSnapshot).mockResolvedValue(null);
    vi.mocked(getCallV4PersistedSurfaceOwner).mockReturnValue("none");
    vi.mocked(isCallV4NativePersistedSurfaceOwner).mockReturnValue(false);
    vi.mocked(readCallV4Identity).mockReturnValue(null);
    vi.mocked(readCallV4Phase).mockReturnValue("idle");
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("blocks immediately when establishment is native-owned", async () => {
    vi.mocked(isNativeEstablishmentOwned).mockResolvedValue(true);
    await expect(resolveNativeOwnedWebV4UiBlock("call-1", "test")).resolves.toBe(true);
    expect(readNativeActiveCallSnapshot).not.toHaveBeenCalled();
  });

  it("blocks when native snapshot is connected for callId", async () => {
    vi.mocked(readNativeActiveCallSnapshot).mockResolvedValue({
      callId: "call-2",
      phase: "CONNECTED",
      mediaType: "voice",
      connected: true,
    });
    await expect(resolveNativeOwnedWebV4UiBlock("call-2", "test")).resolves.toBe(true);
  });

  it("uses auxiliary store connected when primary checks fail", async () => {
    vi.mocked(readCallV4Identity).mockReturnValue({
      callId: "call-3",
      roomId: "room",
      callerUserId: "a",
      calleeUserId: "b",
      direction: "incoming",
      mediaType: "audio",
      createdAt: new Date().toISOString(),
      peerAvatarUrl: null,
    });
    vi.mocked(readCallV4Phase).mockReturnValue("connected");
    await expect(resolveNativeOwnedWebV4UiBlock("call-3", "test")).resolves.toBe(true);
  });

  it("peek sync blocks on persisted native owner and logs web_v4_ui_mount_blocked", () => {
    vi.mocked(getCallV4PersistedSurfaceOwner).mockReturnValue("native_fsi");
    vi.mocked(isCallV4NativePersistedSurfaceOwner).mockReturnValue(true);
    const logs: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      if (args[0] === "[DIBAY_CALL_V4]" && typeof args[1] === "string") logs.push(args[1]);
      originalInfo(...args);
    };
    try {
      expect(evaluateAuxiliaryNativeOwnedWebV4UiBlock("call-4").block).toBe(true);
      expect(peekNativeOwnedWebV4UiBlockSync("call-4", "test_peek")).toBe(true);
      expect(logs).toContain("web_v4_ui_mount_blocked");
    } finally {
      console.info = originalInfo;
    }
  });

  it("does not block when no native ownership signals", async () => {
    await expect(resolveNativeOwnedWebV4UiBlock("call-open", "test")).resolves.toBe(false);
    expect(peekNativeOwnedWebV4UiBlockSync("call-open")).toBe(false);
  });
});
