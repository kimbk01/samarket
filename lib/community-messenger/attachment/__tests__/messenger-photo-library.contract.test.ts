import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relPath: string): string {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

describe("MessengerPhotoLibrary native bridge contract", () => {
  it("wires JS bridge methods and availability into the recent store", () => {
    const bridge = read("lib/community-messenger/attachment/messenger-photo-library.ts");
    expect(bridge).toContain('MESSENGER_PHOTO_LIBRARY_PLUGIN_ID = "MessengerPhotoLibrary"');
    expect(bridge).toContain("registerPlugin<MessengerPhotoLibraryPlugin>");
    expect(bridge).toContain("nativePromise(MESSENGER_PHOTO_LIBRARY_PLUGIN_ID");
    for (const method of [
      "getPermissionState",
      "requestPermission",
      "getRecentPhotos",
      "pickPhotos",
      "resolvePhotos",
    ]) {
      expect(bridge).toContain(method);
    }
    expect(bridge).toContain("messengerPhotoPayloadToFile");
    expect(bridge).toContain("isMessengerPhotoLibraryNativeAvailable");

    const store = read("lib/community-messenger/attachment/messenger-attachment-recent-store.ts");
    expect(store).toContain("MESSENGER_ATTACHMENT_NATIVE_RECENT_LIMIT = 24");
    expect(store).toContain("isMessengerPhotoLibraryNativeAvailable()");
  });

  it("wires the attachment sheet to native recent, resolve, picker, and permission hint", () => {
    const sheet = read("components/community-messenger/room/phase2/CommunityMessengerAttachmentSheet.tsx");
    expect(sheet).toContain("getMessengerPhotoLibraryPermissionState");
    expect(sheet).toContain("requestMessengerPhotoLibraryPermission");
    expect(sheet).toContain("getMessengerPhotoLibraryRecentPhotos");
    expect(sheet).toContain("resolveMessengerPhotoLibraryPhotos");
    expect(sheet).toContain("pickMessengerPhotoLibraryPhotos");
    expect(sheet).toContain("messengerPhotoPayloadToFile");
    expect(sheet).toContain('data-cm-attachment-device-library={deviceLibrary ? "1" : "0"}');
    expect(sheet).toContain('t("cm_ui_attach_photo_permission_hint")');
  });

  it("registers Android plugin with permissions, MediaStore recent photos, picker, and resolver", () => {
    const mainActivity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(mainActivity).toContain("registerPlugin(NativeDevicePermissionsPlugin.class);");
    expect(mainActivity).toContain("registerPlugin(MessengerPhotoLibraryPlugin.class);");

    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('android.permission.READ_MEDIA_IMAGES');
    expect(manifest).toContain('android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32"');

    const plugin = read("android/app/src/main/java/com/dibay/app/MessengerPhotoLibraryPlugin.java");
    expect(plugin).toContain('@CapacitorPlugin(\n  name = "MessengerPhotoLibrary"');
    expect(plugin).toContain("Manifest.permission.READ_MEDIA_IMAGES");
    expect(plugin).toContain("Manifest.permission.READ_EXTERNAL_STORAGE");
    expect(plugin).toContain("MediaStore.Images.Media.EXTERNAL_CONTENT_URI");
    expect(plugin).toContain("resolver.loadThumbnail(uri, new Size(");
    expect(plugin).toContain("MediaStore.ACTION_PICK_IMAGES");
    expect(plugin).toContain("Intent.ACTION_GET_CONTENT");
    expect(plugin).toContain("resolvePhotos(PluginCall call)");
    expect(plugin).toContain("Base64.NO_WRAP");
    expect(plugin).not.toContain("EXTRA_SIZE_LIMIT");
  });

  it("keeps iOS plugin, Info.plist usage strings, and packageClassList patch wired", () => {
    const iosPlugin = read("ios/App/App/Plugins/MessengerPhotoLibraryPlugin.swift");
    expect(iosPlugin).toContain('jsName = "MessengerPhotoLibrary"');
    expect(iosPlugin).toContain('if state == "denied" || state == "prompt"');
    expect(iosPlugin).toContain("config.selection = .ordered");
    expect(iosPlugin).toContain('id.hasPrefix("phasset:")');

    const info = read("ios/App/App/Info.plist");
    expect(info).toContain("NSPhotoLibraryUsageDescription");
    expect(info).toContain("NSPhotoLibraryAddUsageDescription");

    const patchScript = read("scripts/patch-ios-capacitor-package-class-list.mjs");
    expect(patchScript).toContain('"MessengerPhotoLibraryPlugin"');

    const capConfig = read("ios/App/App/capacitor.config.json");
    expect(capConfig).toContain('"MessengerPhotoLibraryPlugin"');
  });

  it("adds permission hint in both community messenger catalogs", () => {
    const catalog = read("lib/i18n/catalog/community-messenger-ui.ts");
    expect(catalog).toContain("cm_ui_attach_photo_permission_hint");
    expect(catalog).toContain("사진 접근 권한을 허용하면 최근 사진을 바로 선택할 수 있습니다.");
    expect(catalog).toContain("Allow photo access to select recent photos directly.");
  });
});
