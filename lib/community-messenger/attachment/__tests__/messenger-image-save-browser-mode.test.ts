import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 구버전 앱 바이너리(설치된 앱에 saveImages 없음) — Android·iOS 동일:
 * 저장 UI 는 유지(14d528dd 회귀 방지)하되 저장을 눌러도 화면 이동(Safari/Custom Tabs) 없이 업데이트 안내만.
 * 「원본 열기」는 사용자가 안내에서 직접 누를 때만.
 */
const opened: string[] = [];
let ios = false;

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => true,
  hasIosCapacitorBridge: () => ios,
}));
vi.mock("@/lib/community-messenger/attachment/messenger-photo-library", () => ({
  probeMessengerNativeImageSaveSupport: vi.fn(async () => false),
  saveImagesToNativePhotoLibrary: vi.fn(),
}));
vi.mock("@/lib/community-messenger/messenger-file-download", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    openMessengerFileInNativeShellIfNeeded: (url: string) => {
      opened.push(url);
      return true;
    },
  };
});

const URL1 = "https://x.supabase.co/storage/v1/object/public/post-images/u/community/messenger-image/r/a.jpg";

function setBrowserPlugin(available: boolean) {
  (globalThis as unknown as { window: unknown }).window = {
    Capacitor: { isPluginAvailable: (name: string) => available && name === "Browser" },
  };
}

describe("messenger image save — old binary (update_required)", () => {
  beforeEach(() => {
    opened.length = 0;
    ios = false;
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("no saveImages → update_required regardless of Browser plugin (save UI stays visible)", async () => {
    const { resolveMessengerImageSaveMode } = await import("@/lib/community-messenger/attachment/messenger-image-save");
    setBrowserPlugin(true);
    expect(await resolveMessengerImageSaveMode()).toBe("update_required");
    setBrowserPlugin(false);
    expect(await resolveMessengerImageSaveMode()).toBe("update_required");
  });

  for (const platform of ["android", "ios"] as const) {
    it(`${platform}: save never navigates — update notice with manual 「원본 열기」`, async () => {
      setBrowserPlugin(true);
      ios = platform === "ios";
      const m = await import("@/lib/community-messenger/attachment/messenger-image-save");
      const outcome = await m.saveMessengerImages([URL1]);
      expect(opened).toEqual([]);
      expect(outcome).toMatchObject({ mode: "update_required", savedCount: 0, updateRequired: true, manualOpenUrl: URL1 });
      const notice = m.messengerImageSaveNotice(outcome);
      expect(notice).toMatchObject({ key: "cm_ui_photo_save_update_required", action: "open_original" });
      expect(notice.variant).not.toBe("success");
    });
  }

  it("manual open: iOS inline original, Android attachment download", async () => {
    const m = await import("@/lib/community-messenger/attachment/messenger-image-save");
    ios = true;
    m.openMessengerImageOriginalForManualSave(URL1);
    ios = false;
    m.openMessengerImageOriginalForManualSave(URL1);
    expect(opened).toEqual([URL1, `${URL1}?download=a.jpg`]);
  });

  it("multiple photos / no Browser plugin → update notice without manual open", async () => {
    setBrowserPlugin(true);
    const m = await import("@/lib/community-messenger/attachment/messenger-image-save");
    const multi = await m.saveMessengerImages([URL1, URL1]);
    expect(multi.manualOpenUrl).toBeUndefined();
    expect(m.messengerImageSaveNotice(multi)).toEqual({ key: "cm_ui_photo_save_update_required", variant: "error" });
    setBrowserPlugin(false);
    const single = await m.saveMessengerImages([URL1]);
    expect(single.manualOpenUrl).toBeUndefined();
    expect(opened).toEqual([]);
  });
});
