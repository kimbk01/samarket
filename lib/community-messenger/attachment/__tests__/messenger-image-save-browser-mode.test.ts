import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 구버전 앱 바이너리(설치된 앱에 saveImages 없음) — 저장 UI 가 사라지던 회귀(14d528dd) 방지.
 * Browser 플러그인이 있으면 mode "browser": 원본을 인앱 브라우저로 넘기고(이전 저장 경로), 성공 문구는 내지 않는다.
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

describe("messenger image save — old binary browser mode", () => {
  beforeEach(() => {
    opened.length = 0;
    ios = false;
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("no saveImages + Browser plugin → mode browser (save UI stays visible)", async () => {
    setBrowserPlugin(true);
    const { resolveMessengerImageSaveMode } = await import("@/lib/community-messenger/attachment/messenger-image-save");
    expect(await resolveMessengerImageSaveMode()).toBe("browser");
  });

  it("no saveImages + no Browser plugin → none", async () => {
    setBrowserPlugin(false);
    const { resolveMessengerImageSaveMode } = await import("@/lib/community-messenger/attachment/messenger-image-save");
    expect(await resolveMessengerImageSaveMode()).toBe("none");
  });

  it("Android: opens attachment download URL; notice is guidance, never success", async () => {
    setBrowserPlugin(true);
    const m = await import("@/lib/community-messenger/attachment/messenger-image-save");
    const outcome = await m.saveMessengerImages([URL1]);
    expect(opened).toEqual([`${URL1}?download=a.jpg`]);
    expect(outcome).toMatchObject({ mode: "browser", savedCount: 0, failedCount: 0, handedOff: "android" });
    const notice = m.messengerImageSaveNotice(outcome);
    expect(notice.key).toBe("cm_ui_photo_save_browser_android");
    expect(notice.variant).not.toBe("success");
  });

  it("iOS: opens inline original (long-press Add to Photos)", async () => {
    setBrowserPlugin(true);
    ios = true;
    const m = await import("@/lib/community-messenger/attachment/messenger-image-save");
    const outcome = await m.saveMessengerImages([URL1]);
    expect(opened).toEqual([URL1]);
    expect(m.messengerImageSaveNotice(outcome).key).toBe("cm_ui_photo_save_browser_ios");
  });

  it("multiple photos at once are not handed off in browser mode (no false success)", async () => {
    setBrowserPlugin(true);
    const m = await import("@/lib/community-messenger/attachment/messenger-image-save");
    const outcome = await m.saveMessengerImages([URL1, URL1]);
    expect(opened).toEqual([]);
    expect(outcome.savedCount).toBe(0);
    expect(m.messengerImageSaveNotice(outcome).variant).toBe("error");
  });
});
