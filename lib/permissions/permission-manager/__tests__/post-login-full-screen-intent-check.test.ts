import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionStore = new Map<string, string>();
const localStore = new Map<string, string>();

function stubLocalStorage(): void {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStore.set(key, value);
    },
    removeItem: (key: string) => {
      localStore.delete(key);
    },
  });
}

let boundUserId: string | null = "user-fsi-1";
vi.mock("@/lib/auth/client-instance-id", () => ({
  getBoundAuthUserId: () => boundUserId,
}));

function stubSessionStorage(): void {
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => sessionStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      sessionStore.set(key, value);
    },
    removeItem: (key: string) => {
      sessionStore.delete(key);
    },
    clear: () => {
      sessionStore.clear();
    },
  });
}

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
  resolveCapacitorShellPlatform: vi.fn(() => "android"),
}));

vi.mock("@/lib/push/native/check-android-full-screen-intent", () => ({
  checkAndroidFullScreenIntentGranted: vi.fn(),
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-manager", () => ({
  openFullScreenIntentSettings: vi.fn(async () => true),
}));

describe("runPostLoginFullScreenIntentCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStore.clear();
    localStore.clear();
    boundUserId = "user-fsi-1";
    stubSessionStorage();
    stubLocalStorage();
  });

  it("opens settings when FSI is not granted", async () => {
    const { checkAndroidFullScreenIntentGranted } = await import(
      "@/lib/push/native/check-android-full-screen-intent"
    );
    const { openFullScreenIntentSettings } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(checkAndroidFullScreenIntentGranted).mockResolvedValue(false);

    const { runPostLoginFullScreenIntentCheck } = await import(
      "@/lib/permissions/permission-manager/post-login-full-screen-intent-check"
    );
    const result = await runPostLoginFullScreenIntentCheck();

    expect(result).toBe("opened_settings");
    expect(openFullScreenIntentSettings).toHaveBeenCalledTimes(1);
  });

  it("returns granted when FSI already enabled", async () => {
    const { checkAndroidFullScreenIntentGranted } = await import(
      "@/lib/push/native/check-android-full-screen-intent"
    );
    const { openFullScreenIntentSettings } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(checkAndroidFullScreenIntentGranted).mockResolvedValue(true);

    const { runPostLoginFullScreenIntentCheck } = await import(
      "@/lib/permissions/permission-manager/post-login-full-screen-intent-check"
    );
    const result = await runPostLoginFullScreenIntentCheck();

    expect(result).toBe("granted");
    expect(openFullScreenIntentSettings).not.toHaveBeenCalled();
  });

  it("skips repeat nudge in same session", async () => {
    const { checkAndroidFullScreenIntentGranted } = await import(
      "@/lib/push/native/check-android-full-screen-intent"
    );
    const { openFullScreenIntentSettings } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(checkAndroidFullScreenIntentGranted).mockResolvedValue(false);

    const { runPostLoginFullScreenIntentCheck } = await import(
      "@/lib/permissions/permission-manager/post-login-full-screen-intent-check"
    );
    await runPostLoginFullScreenIntentCheck();
    vi.mocked(openFullScreenIntentSettings).mockClear();

    const second = await runPostLoginFullScreenIntentCheck();
    expect(second).toBe("skipped");
    expect(openFullScreenIntentSettings).not.toHaveBeenCalled();
  });

  it("B5: does not re-open settings on a new process (cold start) of the same login", async () => {
    const { checkAndroidFullScreenIntentGranted } = await import(
      "@/lib/push/native/check-android-full-screen-intent"
    );
    const { openFullScreenIntentSettings } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(checkAndroidFullScreenIntentGranted).mockResolvedValue(false);
    const { runPostLoginFullScreenIntentCheck } = await import(
      "@/lib/permissions/permission-manager/post-login-full-screen-intent-check"
    );
    expect(await runPostLoginFullScreenIntentCheck()).toBe("opened_settings");
    // new process: sessionStorage gone, localStorage (same login) kept
    sessionStore.clear();
    vi.mocked(openFullScreenIntentSettings).mockClear();
    expect(await runPostLoginFullScreenIntentCheck()).toBe("skipped");
    expect(openFullScreenIntentSettings).not.toHaveBeenCalled();
  });

  it("B5: a different login (logout wipe / other account) is nudged again", async () => {
    const { checkAndroidFullScreenIntentGranted } = await import(
      "@/lib/push/native/check-android-full-screen-intent"
    );
    const { openFullScreenIntentSettings } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(checkAndroidFullScreenIntentGranted).mockResolvedValue(false);
    const { runPostLoginFullScreenIntentCheck } = await import(
      "@/lib/permissions/permission-manager/post-login-full-screen-intent-check"
    );
    await runPostLoginFullScreenIntentCheck();
    sessionStore.clear();
    boundUserId = "user-fsi-2";
    vi.mocked(openFullScreenIntentSettings).mockClear();
    expect(await runPostLoginFullScreenIntentCheck()).toBe("opened_settings");
    expect(openFullScreenIntentSettings).toHaveBeenCalledTimes(1);
  });
});
