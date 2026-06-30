import { beforeEach, describe, expect, it, vi } from "vitest";

const callPermissionCheck = vi.hoisted(() => vi.fn());
const openPermissionEducationSheet = vi.hoisted(() => vi.fn());
const openNativeCallPermissionSettings = vi.hoisted(() => vi.fn());
const buildPermissionCapabilitySummary = vi.hoisted(() => vi.fn());
const isCapacitorNativePlatform = vi.hoisted(() => vi.fn(() => true));
const resolveCapacitorShellPlatform = vi.hoisted(() => vi.fn((): "android" | "ios" | null => "android"));

vi.mock("@/lib/call/permissions/call-permission-gate", () => ({
  callPermissionGate: { check: callPermissionCheck },
}));

vi.mock("@/lib/permissions/education/permission-education-bridge", () => ({
  openPermissionEducationSheet,
  showPermissionEducationSuccessToast: vi.fn(),
}));

vi.mock("@/lib/call/native/native-call-permissions", () => ({
  openNativeCallPermissionSettings,
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-manager", () => ({
  openFullScreenIntentSettings: vi.fn(),
  openBatteryOptimizationSettings: vi.fn(),
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-ui-bridge", () => ({
  getNotificationGuidePending: vi.fn(() => null),
}));

vi.mock("@/lib/permissions/education/permission-capability-summary", () => ({
  buildPermissionCapabilitySummary,
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
}));

import {
  resetPermissionEducationOrchestratorForTests,
  runCallMediaEducationBeforeGesture,
  runLockScreenEducationIfNeeded,
} from "@/lib/permissions/education/permission-education-orchestrator";

describe("runCallMediaEducationBeforeGesture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPermissionEducationOrchestratorForTests();
    isCapacitorNativePlatform.mockReturnValue(true);
    resolveCapacitorShellPlatform.mockReturnValue("android");
    buildPermissionCapabilitySummary.mockResolvedValue({
      items: [],
      overallReady: true,
      receiveReady: true,
      lockScreenIncomingReady: true,
      syncedAt: 1,
    });
  });

  it("proceeds when call media already granted", async () => {
    callPermissionCheck.mockResolvedValue({ canVoice: true, canVideo: true });
    const result = await runCallMediaEducationBeforeGesture("voice", "outgoing");
    expect(result.proceed).toBe(true);
    expect(openPermissionEducationSheet).not.toHaveBeenCalled();
  });

  it("blocks when user chooses later", async () => {
    callPermissionCheck.mockResolvedValue({ canVoice: false, canVideo: false });
    openPermissionEducationSheet.mockResolvedValue("later");
    const result = await runCallMediaEducationBeforeGesture("voice", "outgoing");
    expect(result.proceed).toBe(false);
    expect(openPermissionEducationSheet).toHaveBeenCalled();
  });

  it("proceeds after allow on education sheet", async () => {
    callPermissionCheck.mockResolvedValue({ canVoice: false, canVideo: false });
    openPermissionEducationSheet.mockResolvedValue("allow");
    const result = await runCallMediaEducationBeforeGesture("video", "incoming");
    expect(result.proceed).toBe(true);
  });

  it("rechecks after settings for call media", async () => {
    callPermissionCheck
      .mockResolvedValueOnce({ canVoice: false, canVideo: false })
      .mockResolvedValueOnce({ canVoice: true, canVideo: false });
    openPermissionEducationSheet.mockResolvedValue("settings");
    openNativeCallPermissionSettings.mockResolvedValue(true);
    const result = await runCallMediaEducationBeforeGesture("voice", "outgoing");
    expect(openNativeCallPermissionSettings).toHaveBeenCalled();
    expect(result.proceed).toBe(true);
  });
});

describe("runLockScreenEducationIfNeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPermissionEducationOrchestratorForTests();
    isCapacitorNativePlatform.mockReturnValue(false);
    resolveCapacitorShellPlatform.mockReturnValue(null);
  });

  it("does not open lock-tier education on web/windows", async () => {
    await runLockScreenEducationIfNeeded();
    expect(openPermissionEducationSheet).not.toHaveBeenCalled();
  });
});
