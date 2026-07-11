import { beforeEach, describe, expect, it, vi } from "vitest";

const callPermissionCheck = vi.hoisted(() => vi.fn());

vi.mock("@/lib/call/permissions/call-permission-gate", () => ({
  callPermissionGate: { check: callPermissionCheck },
}));

vi.mock("@/lib/permissions/education/permission-education-platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
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
        os: { microphone: "permanently_denied", camera: "permanently_denied" },
      } as never),
    ).toBe(true);
  });
});

describe("runCallMediaEducationBeforeGesture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPermissionEducationOrchestratorForTests();
  });

  it("proceeds when call media already granted", async () => {
    callPermissionCheck.mockResolvedValue({ canVoice: true, canVideo: true });
    const result = await runCallMediaEducationBeforeGesture("voice", "outgoing");
    expect(result.proceed).toBe(true);
  });

  it("skips sheet and proceeds when OS prompt is still available", async () => {
    callPermissionCheck.mockResolvedValue({
      canVoice: false,
      canVideo: false,
      isPermanentlyDenied: false,
      effectiveState: "denied_once",
      microphoneGranted: false,
      cameraGranted: false,
      os: { microphone: "prompt_available", camera: "prompt_available" },
    });
    const result = await runCallMediaEducationBeforeGesture("voice", "outgoing");
    expect(result.proceed).toBe(true);
  });

  it("does not proceed when permanently denied", async () => {
    callPermissionCheck.mockResolvedValue({
      canVoice: false,
      canVideo: false,
      isPermanentlyDenied: true,
      effectiveState: "denied_permanently",
      microphoneGranted: false,
      cameraGranted: false,
      os: { microphone: "permanently_denied", camera: "permanently_denied" },
    });
    const result = await runCallMediaEducationBeforeGesture("voice", "outgoing");
    expect(result.proceed).toBe(false);
  });
});

describe("runLockScreenEducationIfNeeded", () => {
  it("is a no-op", async () => {
    await expect(runLockScreenEducationIfNeeded()).resolves.toBeUndefined();
  });
});
