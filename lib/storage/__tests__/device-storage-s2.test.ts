// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DIBAY_DEVICE_STORAGE_PLUGIN_ID,
  estimateClearableWebStorageBytes,
  formatStorageBytes,
  hasNativeDeviceStoragePlugin,
  readNativeDeviceStorageUsage,
} from "@/lib/storage/device-storage-native.client";

/** 기기 저장공간 S2 (2026-11-19) — 근거: docs/audit/device-storage-legacy-design-2026-11-19.md §4 S2 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

afterEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  localStorage.clear();
  sessionStorage.clear();
});

describe("웹 쪽 — 플러그인 있는 앱만 열고, 구 바이너리·웹은 기존 화면", () => {
  it("플러그인 헤더가 없으면 false · 용량 읽기 null", async () => {
    expect(hasNativeDeviceStoragePlugin()).toBe(false);
    expect(await readNativeDeviceStorageUsage()).toBeNull();
  });

  it("플러그인 헤더가 있으면 true", () => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { PluginHeaders: [{ name: DIBAY_DEVICE_STORAGE_PLUGIN_ID }] };
    expect(hasNativeDeviceStoragePlugin()).toBe(true);
  });

  it("목록 저장본 용량은 지울 수 있게 등록된 키만 센다(로그인·초안 제외)", () => {
    localStorage.setItem("samarket:home-posts:local:v1:a", "x".repeat(100));
    localStorage.setItem("sb-proj-auth-token", "y".repeat(10_000));
    localStorage.setItem("samarket:trade-write-form-local", "z".repeat(10_000));
    const bytes = estimateClearableWebStorageBytes();
    expect(bytes).toBe(("samarket:home-posts:local:v1:a".length + 100) * 2);
  });

  it("크기 표시", () => {
    expect(formatStorageBytes(0)).toBe("1 KB");
    expect(formatStorageBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatStorageBytes(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });

  it("화면: 플러그인 있을 때만 용량 묶음·사진 항목, 없으면 사진은 「지우지 않는 항목」", () => {
    const ui = read("components/my/settings/CacheSettingsContent.tsx");
    expect(ui).toContain('{nativeAvailable ? (\n        <MyGroup title={t("mypage_s17_usage_title")}>');
    expect(ui).toContain('nativeAvailable ? t("mypage_s17_keeps_gallery_photos") : t("mypage_s17_keeps_photos")');
  });
});

describe("네이티브 — 캐시만 지우고 로그인(쿠키·로컬 저장소)·사진첩은 건드리지 않음", () => {
  it("Android: 플러그인 등록 · WebView.clearCache · 앱 전용 Pictures/JPEG_* 만 · 10분 보호", () => {
    const java = read("android/app/src/main/java/com/dibay/app/DibayDeviceStoragePlugin.java");
    expect(java).toContain('@CapacitorPlugin(name = "DibayDeviceStorage")');
    expect(java).toContain("wv.clearCache(true)");
    expect(java).not.toMatch(/CookieManager|clearFormData|WebStorage/);
    expect(java).toContain('n.startsWith("JPEG_")');
    expect(java).toContain("getExternalFilesDir(Environment.DIRECTORY_PICTURES)");
    expect(read("android/app/src/main/java/com/dibay/app/MainActivity.java")).toContain(
      "registerPlugin(DibayDeviceStoragePlugin.class);"
    );
  });

  it("iOS: 디스크·메모리 캐시 형식만 삭제 · 프로젝트 등록 4곳 · 브리지 등록", () => {
    const swift = read("ios/App/App/Plugins/DibayDeviceStoragePlugin.swift");
    expect(swift).toContain("[WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]");
    expect(swift).not.toMatch(/WKWebsiteDataTypeCookies|LocalStorage|allWebsiteDataTypes/);
    const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
    // 참조 플러그인(DibayDeviceClassPlugin)과 같은 등록 형태 — 빌드 파일·파일 참조·그룹·Sources 4줄(이름 6회)
    expect(pbx.match(/DibayDeviceStoragePlugin\.swift/g)?.length).toBe(pbx.match(/DibayDeviceClassPlugin\.swift/g)?.length);
    expect(read("ios/App/App/DibayRootBridgeViewController.swift")).toContain("DibayDeviceStoragePlugin(),");
  });
});
