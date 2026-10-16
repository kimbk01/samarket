import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 사진 저장 결과 스낵바 — 「다시 시도」는 실패한 장만, 권한 거부는 「설정 열기」,
 * 구버전 앱(browser)은 확인 후에만 원본 열기.
 */
let mode: "native" | "browser" | "web" | "none" = "native";
const nativeCalls: string[][] = [];
let nativeImpl: (urls: string[]) => { saved: number[]; failed: { index: number; reason: string }[]; permission: string };
const openSettings = vi.fn(async () => true);

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => mode === "native" || mode === "browser",
  hasIosCapacitorBridge: () => false,
}));
vi.mock("@/lib/community-messenger/attachment/messenger-photo-library", () => ({
  probeMessengerNativeImageSaveSupport: vi.fn(async () => mode === "native"),
  saveImagesToNativePhotoLibrary: vi.fn(async (urls: string[]) => {
    nativeCalls.push([...urls]);
    return nativeImpl(urls);
  }),
  openMessengerAppSettings: vi.fn(async () => false),
}));
vi.mock("@/lib/community-messenger/stores/messenger-snackbar-store", () => ({
  showMessengerSnackbar: vi.fn(),
}));
vi.mock("@/components/ui/dibay-overlay/DibayAppDialogProvider", () => ({
  dibayConfirm: vi.fn(async () => false),
}));
vi.mock("@/lib/community-messenger/messenger-file-download", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, openMessengerFileInNativeShellIfNeeded: vi.fn(() => true) };
});

const P = "https://x.supabase.co/storage/v1/object/public/post-images/u/r";
const A = `${P}/a.jpg`;
const B = `${P}/b.jpg`;
const C = `${P}/c.jpg`;

type Notified = { message: string; opts?: { variant?: string; action?: { label: string; onPress: () => void } } };

function setup() {
  const notified: Notified[] = [];
  const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
  return {
    notified,
    deps: {
      t: t as never,
      notify: (message: string, opts?: Notified["opts"]) => notified.push({ message, opts }),
      openSettings,
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("messenger photo save feedback", () => {
  beforeEach(() => {
    mode = "native";
    nativeCalls.length = 0;
    openSettings.mockClear();
    (globalThis as unknown as { window: unknown }).window = {
      Capacitor: { isPluginAvailable: (n: string) => n === "Browser" },
    };
  });

  it("partial failure → 「다시 시도」 retries only failed photos (album order)", async () => {
    nativeImpl = (urls) =>
      urls.length === 3
        ? { saved: [1], failed: [{ index: 0, reason: "x" }, { index: 2, reason: "x" }], permission: "granted" }
        : { saved: urls.map((_, i) => i), failed: [], permission: "granted" };
    const { saveMessengerPhotosWithFeedback } = await import(
      "@/components/community-messenger/room/messenger-photo-save-feedback"
    );
    const { notified, deps } = setup();
    const outcome = await saveMessengerPhotosWithFeedback([A, B, C], deps);
    expect(outcome?.failedUrls).toEqual([A, C]);
    expect(notified[0]!.message).toContain("cm_ui_photo_save_partial");
    expect(notified[0]!.opts?.action?.label).toBe("cm_ui_photo_save_retry");

    notified[0]!.opts!.action!.onPress();
    await flush();
    await flush();
    expect(nativeCalls).toEqual([[A, B, C], [A, C]]);
    expect(notified[1]!.message).toContain("cm_ui_photo_saved_count");
    expect(notified[1]!.opts?.variant).toBe("success");
    expect(notified[1]!.opts?.action).toBeUndefined();
  });

  it("all failed → error with retry, never success", async () => {
    nativeImpl = (urls) => ({ saved: [], failed: urls.map((_, index) => ({ index, reason: "x" })), permission: "granted" });
    const { saveMessengerPhotosWithFeedback } = await import(
      "@/components/community-messenger/room/messenger-photo-save-feedback"
    );
    const { notified, deps } = setup();
    await saveMessengerPhotosWithFeedback([A], deps);
    expect(notified[0]!.message).toBe("cm_ui_photo_save_failed");
    expect(notified[0]!.opts?.variant).toBe("error");
    expect(notified[0]!.opts?.action?.label).toBe("cm_ui_photo_save_retry");
  });

  it("permission denied → 「설정 열기」 calls openMessengerAppSettings", async () => {
    nativeImpl = (urls) => ({
      saved: [],
      failed: urls.map((_, index) => ({ index, reason: "permission_denied" })),
      permission: "denied",
    });
    const { saveMessengerPhotosWithFeedback } = await import(
      "@/components/community-messenger/room/messenger-photo-save-feedback"
    );
    const { notified, deps } = setup();
    await saveMessengerPhotosWithFeedback([A, B], deps);
    expect(notified[0]!.message).toBe("cm_ui_photo_save_permission_denied");
    expect(notified[0]!.opts?.action?.label).toBe("cm_ui_photo_save_open_settings");
    notified[0]!.opts!.action!.onPress();
    await flush();
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(notified.length).toBe(1);
  });

  it("permission denied + settings unsupported → guidance notice", async () => {
    nativeImpl = () => ({ saved: [], failed: [], permission: "denied" });
    const { saveMessengerPhotosWithFeedback } = await import(
      "@/components/community-messenger/room/messenger-photo-save-feedback"
    );
    const { notified, deps } = setup();
    openSettings.mockResolvedValueOnce(false);
    await saveMessengerPhotosWithFeedback([A], deps);
    notified[0]!.opts!.action!.onPress();
    await flush();
    await flush();
    expect(notified[1]!.message).toBe("cm_ui_photo_save_open_settings_unavailable");
  });

  it("default openSettings is openMessengerAppSettings from photo-library", async () => {
    nativeImpl = () => ({ saved: [], failed: [], permission: "denied" });
    const lib = await import("@/lib/community-messenger/attachment/messenger-photo-library");
    const { saveMessengerPhotosWithFeedback } = await import(
      "@/components/community-messenger/room/messenger-photo-save-feedback"
    );
    const { notified, deps } = setup();
    await saveMessengerPhotosWithFeedback([A], { t: deps.t, notify: deps.notify });
    notified[0]!.opts!.action!.onPress();
    await flush();
    expect(lib.openMessengerAppSettings).toHaveBeenCalled();
  });

  it("old app (browser mode): cancel on update sheet → nothing opened", async () => {
    mode = "browser";
    const dl = await import("@/lib/community-messenger/messenger-file-download");
    const { saveMessengerPhotosWithFeedback } = await import(
      "@/components/community-messenger/room/messenger-photo-save-feedback"
    );
    const { notified, deps } = setup();
    const confirm = vi.fn(async () => false);
    const r = await saveMessengerPhotosWithFeedback([A], { ...deps, confirm });
    expect(r).toBeNull();
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "cm_ui_photo_save_update_title",
        description: "cm_ui_photo_save_update_body",
        confirmLabel: "cm_ui_photo_save_open_original",
        cancelLabel: "common_cancel",
      })
    );
    expect(dl.openMessengerFileInNativeShellIfNeeded).not.toHaveBeenCalled();
    expect(notified).toEqual([]);
  });

  it("old app (browser mode): 원본 열기 → existing hand-off, guidance notice", async () => {
    mode = "browser";
    const dl = await import("@/lib/community-messenger/messenger-file-download");
    const { saveMessengerPhotosWithFeedback } = await import(
      "@/components/community-messenger/room/messenger-photo-save-feedback"
    );
    const { notified, deps } = setup();
    const r = await saveMessengerPhotosWithFeedback([A], { ...deps, confirm: async () => true });
    expect(r?.handedOff).toBe("android");
    expect(dl.openMessengerFileInNativeShellIfNeeded).toHaveBeenCalledTimes(1);
    expect(notified[0]!.message).toBe("cm_ui_photo_save_browser_android");
    expect(notified[0]!.opts?.variant).not.toBe("success");
  });
});
