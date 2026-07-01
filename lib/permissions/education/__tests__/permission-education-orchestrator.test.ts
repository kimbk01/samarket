import { beforeEach, describe, expect, it, vi } from "vitest";

const callPermissionCheck = vi.hoisted(() => vi.fn());
const openPermissionEducationSheet = vi.hoisted(() => vi.fn());
const openNativeCallPermissionSettings = vi.hoisted(() => vi.fn());
const isCapacitorNativePlatform = vi.hoisted(() => vi.fn(() => true));
const resolveCapacitorShellPlatform = vi.hoisted(() => vi.fn((): "android" | "ios" | null => "android"));

vi.mock("@/lib/call/permissions/call-permission-gate", () => ({
  callPermissionGate: { check: callPermissionCheck },
}));

vi.mock("@/lib/permissions/education/permission-education-bridge", () => ({
  openPermissionEducationSheet,
}));

vi.mock("@/lib/call/native/native-call-permissions", () => ({
  openNativeCallPermissionSettings,
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
}));

import {
  needsCallMediaSettingsEducation,
  resetPermissionEducationOrchestratorForTests,
  runCallMediaEducationBeforeGesture,
  runLockScreenEducationIfNeeded,
} from "@/lib/permissions/education/permission-education-orchestrator";

describe("needsCallMediaSettingsEducation", () => {
  it("returns true for permanently denied", () => {
    expect(
      needsCallMediaSettingsEducation("voice", {
        isPermanentlyDenied: true,
        effectiveState: "denied_permanently",
        canVoice: false,
        canVideo: false,
        microphoneGranted: false,
        cameraGranted: false,
        os: { microphone: "denied", camera: "denied" },
      } as never),
    ).toBe(true);
  });

  it("returns true for system_revoked", () => {
    expect(
      needsCallMediaSettingsEducation("voice", {
        isPermanentlyDenied: false,
        effectiveState: "system_revoked",
        canVoice: false,
        canVideo: false,
        microphoneGranted: false,
        cameraGranted: false,
        os: { microphone: "denied", camera: "denied" },
      } as never),
    ).toBe(true);
  });

  it("returns false when OS prompt may still work", () => {
    expect(
      needsCallMediaSettingsEducation("voice", {
        isPermanentlyDenied: false,
        effectiveState: "denied_once",
        canVoice: false,
        canVideo: false,
        microphoneGranted: false,
        cameraGranted: false,
        os: { microphone: "prompt", camera: "prompt" },
      } as never),
    ).toBe(false);
  });
});

describe("runCallMediaEducationBeforeGesture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPermissionEducationOrchestratorForTests();
    isCapacitorNativePlatform.mockReturnValue(true);
    resolveCapacitorShellPlatform.mockReturnValue("android");
  });

  it("proceeds when call media already granted", async () => {
    callPermissionCheck.mockResolvedValue({ canVoice: true, canVideo: true });
    const result = await runCallMediaEducationBeforeGesture("voice", "outgoing");
    expect(result.proceed).toBe(true);
    expect(openPermissionEducationSheet).not.toHaveBeenCalled();
  });

  it("skips sheet and proceeds when OS prompt is still available", async () => {
    callPermissionCheck.mockResolvedValue({
      canVoice: false,
      canVideo: false,
      isPermanentlyDenied: false,
      effectiveState: "denied_once",
      microphoneGranted: false,
      cameraGranted: false,
      os: { microphone: "prompt", camera: "prompt" },
    });
    const result = await runCallMediaEducationBeforeGesture("voice", "outgoing");
    expect(result.proceed).toBe(true);
    expect(openPermissionEducationSheet).not.toHaveBeenCalled();
  });

  it("opens settings sheet when permanently denied", async () => {
    callPermissionCheck.mockResolvedValue({
      canVoice: false,
      canVideo: false,
      isPermanentlyDenied: true,
      effectiveState: "denied_permanently",
      microphoneGranted: false,
      cameraGranted: false,
      os: { microphone: "denied", camera: "denied" },
    });
    openPermissionEducationSheet.mockResolvedValue("later");
    const result = await runCallMediaEducationBeforeGesture("voice", "outgoing");
    expect(result.proceed).toBe(false);
    expect(openPermissionEducationSheet).toHaveBeenCalled();
  });

  it("rechecks after settings for call media", async () => {
    callPermissionCheck
      .mockResolvedValueOnce({
        canVoice: false,
        canVideo: false,
        isPermanentlyDenied: true,
        effectiveState: "denied_permanently",
        microphoneGranted: false,
        cameraGranted: false,
        os: { microphone: "denied", camera: "denied" },
      })
      .mockResolvedValueOnce({ canVoice: true, canVideo: false });
    openPermissionEducationSheet.mockResolvedValue("settings");
    openNativeCallPermissionSettings.mockResolvedValue(true);
    const result = await runCallMediaEducationBeforeGesture("voice", "outgoing");
    expect(openNativeCallPermissionSettings).toHaveBeenCalled();
    expect(result.proceed).toBe(true);
  });
});

vi.mock("@/lib/permissions/permission-manager/full-screen-intent-guide-flow", () => ({
  runFullScreenIntentEducationBeforeCall: vi.fn(async () => {}),
}));

describe("runLockScreenEducationIfNeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPermissionEducationOrchestratorForTests();
  });

  it("is a no-op (FSI deferred to lock-screen failure follow-up)", async () => {
    const { runFullScreenIntentEducationBeforeCall } = await import(
      "@/lib/permissions/permission-manager/full-screen-intent-guide-flow"
    );
    await runLockScreenEducationIfNeeded();
    expect(runFullScreenIntentEducationBeforeCall).not.toHaveBeenCalled();
    expect(openPermissionEducationSheet).not.toHaveBeenCalled();
  });
});
