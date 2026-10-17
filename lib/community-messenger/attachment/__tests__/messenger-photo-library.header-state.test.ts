import { afterEach, describe, expect, it } from "vitest";
import { readMessengerPhotoLibraryHeaderState } from "@/lib/community-messenger/attachment/messenger-photo-library";

/** 설정 화면 진단 코드 — Capacitor Android(JSExport.java)·iOS(JSExport.swift) 헤더 형식 그대로. */
function setHeaders(headers: unknown) {
  (globalThis as unknown as { window: unknown }).window = { Capacitor: { PluginHeaders: headers } };
}

describe("readMessengerPhotoLibraryHeaderState", () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("save_ready when the plugin header lists saveImages", () => {
    setHeaders([
      { name: "App", methods: [{ name: "getInfo", rtype: "promise" }] },
      { name: "MessengerPhotoLibrary", methods: [{ name: "pickPhotos", rtype: "promise" }, { name: "saveImages", rtype: "promise" }] },
    ]);
    expect(readMessengerPhotoLibraryHeaderState()).toBe("save_ready");
  });
  it("no_save_method for an old binary (plugin without saveImages)", () => {
    setHeaders([{ name: "MessengerPhotoLibrary", methods: [{ name: "pickPhotos", rtype: "promise" }] }]);
    expect(readMessengerPhotoLibraryHeaderState()).toBe("no_save_method");
  });
  it("no_plugin when headers exist without MessengerPhotoLibrary", () => {
    setHeaders([{ name: "App", methods: [] }]);
    expect(readMessengerPhotoLibraryHeaderState()).toBe("no_plugin");
  });
  it("no_headers when the bridge did not inject PluginHeaders", () => {
    setHeaders(undefined);
    expect(readMessengerPhotoLibraryHeaderState()).toBe("no_headers");
  });
});
