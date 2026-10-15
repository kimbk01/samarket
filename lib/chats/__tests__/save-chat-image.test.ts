/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveChatImagesToDevice, saveChatImageToDevice } from "@/lib/chats/save-chat-image";

const URLS = ["https://cdn.x/a.jpg", "https://cdn.x/b.png", "https://cdn.x/c.jpg"];

function stubFetch(failIdx: number[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const i = URLS.indexOf(url);
      if (failIdx.includes(i)) return new Response("no", { status: 404 });
      return new Response(new Blob(["x"], { type: url.endsWith(".png") ? "image/png" : "image/jpeg" }), { status: 200 });
    })
  );
}

let clicks: string[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  clicks = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push(this.download);
  });
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => "blob:x";
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
});

async function run<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

function stubShare(impl: (data: ShareData) => Promise<void>) {
  const share = vi.fn(impl);
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
  return share;
}

describe("D-4 web save-all: one share call, cancel is not a download", () => {
  it("shares all files in ONE navigator.share call (user activation is single-use)", async () => {
    stubFetch();
    const share = stubShare(async () => undefined);
    const r = await run(saveChatImagesToDevice(URLS, "dibay"));
    expect(share).toHaveBeenCalledTimes(1);
    expect((share.mock.calls[0]![0] as ShareData).files).toHaveLength(3);
    expect(r).toMatchObject({ status: "saved", savedCount: 3, failedCount: 0, method: "share" });
    expect(clicks).toEqual([]);
  });

  it("AbortError (user cancelled the share sheet) → cancelled, no fallback download", async () => {
    stubFetch();
    stubShare(async () => {
      throw new DOMException("cancel", "AbortError");
    });
    const r = await run(saveChatImagesToDevice(URLS, "dibay"));
    expect(r.status).toBe("cancelled");
    expect(r.savedCount).toBe(0);
    expect(clicks).toEqual([]);
  });

  it("NotAllowedError (activation expired) → sequential downloads", async () => {
    stubFetch();
    stubShare(async () => {
      throw new DOMException("no", "NotAllowedError");
    });
    const r = await run(saveChatImagesToDevice(URLS, "dibay"));
    expect(r).toMatchObject({ status: "saved", savedCount: 3, method: "download" });
    expect(clicks.map((n) => n.replace(/\.[a-z]+$/, ""))).toEqual(["dibay-1", "dibay-2", "dibay-3"]);
  });

  it("no Web Share → sequential anchor downloads; fetch failures reported as partial", async () => {
    stubFetch([1]);
    const r = await run(saveChatImagesToDevice(URLS, "dibay"));
    expect(r).toMatchObject({ status: "partial", savedCount: 2, failedCount: 1, method: "download" });
    expect(clicks).toHaveLength(2);
  });

  it("all fetches fail → failed", async () => {
    stubFetch([0, 1, 2]);
    const r = await run(saveChatImagesToDevice(URLS, "dibay"));
    expect(r).toMatchObject({ status: "failed", savedCount: 0, failedCount: 3 });
  });

  it("single-image API stays compatible ({ ok }) and reports cancel without downloading", async () => {
    stubFetch();
    expect(await run(saveChatImageToDevice(URLS[0]!, "one"))).toEqual({ ok: true });
    expect(clicks).toEqual(["one.jpg"]);
    stubShare(async () => {
      throw new DOMException("cancel", "AbortError");
    });
    expect(await run(saveChatImageToDevice(URLS[0]!, "one"))).toEqual({ ok: false, cancelled: true });
    expect(clicks).toEqual(["one.jpg"]);
  });
});

describe("messenger web save outcome + notice", () => {
  it("cancelled web save → distinct cancelled notice (not failed)", async () => {
    const { messengerImageSaveNotice } = await import("@/lib/community-messenger/attachment/messenger-image-save");
    expect(
      messengerImageSaveNotice({ mode: "web", total: 2, savedCount: 0, failedCount: 0, permissionDenied: false, cancelled: true })
    ).toEqual({ key: "cm_ui_photo_save_cancelled", variant: "default" });
  });

  it("saveMessengerImages (web) uses one batch call and maps cancelled", async () => {
    vi.resetModules();
    vi.doMock("@/lib/platform/capacitor-native", () => ({
      isCapacitorNativePlatform: () => false,
      isCapacitorBridgeReady: () => false,
      waitForCapacitorBridgeReady: async () => false,
    }));
    const batch = vi.fn(async () => ({ status: "cancelled", total: 2, savedCount: 0, failedCount: 0, method: "share" }));
    vi.doMock("@/lib/chats/save-chat-image", () => ({ saveChatImagesToDevice: batch }));
    const { saveMessengerImages } = await import("@/lib/community-messenger/attachment/messenger-image-save");
    const out = await saveMessengerImages(URLS.slice(0, 2));
    expect(batch).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ mode: "web", savedCount: 0, failedCount: 0, cancelled: true });
    vi.doUnmock("@/lib/platform/capacitor-native");
    vi.doUnmock("@/lib/chats/save-chat-image");
  });
});
