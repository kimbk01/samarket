import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isGuestPublicBrowsePath } from "@/lib/auth/guest-browse-access-policy";
import {
  DIBAY_ANDROID_PLAY_STORE_PUBLIC,
  DIBAY_ANDROID_PLAY_STORE_URL,
  DIBAY_APP_LANDING_PATH,
  DIBAY_IOS_APP_STORE_REDIRECT_URL,
  DIBAY_IOS_APP_STORE_URL,
  resolveDeviceStoreUrl,
} from "@/lib/share/app-store-links";
import { buildShareUrl } from "@/lib/share/share-url";
import { MYPAGE_IA_CATEGORIES } from "@/lib/mypage/mypage-ia";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("앱 공유 (Owner G-1 2026-11-14)", () => {
  it("앱 공유 링크 = 운영 /download · 비회원 공개", () => {
    expect(DIBAY_APP_LANDING_PATH).toBe("/download");
    expect(buildShareUrl({ kind: "app" })).toMatch(/^https:\/\/[^/]+\/download$/);
    expect(isGuestPublicBrowsePath("/download")).toBe(true);
    expect(isGuestPublicBrowsePath("/download/x")).toBe(false);
  });

  it("스토어 주소 — iOS ID 6831952401, Android 설치 버튼은 Play 공개 확인(2026-11-20) 뒤 표시(G-13)", () => {
    expect(DIBAY_IOS_APP_STORE_URL).toBe("https://apps.apple.com/app/id6831952401");
    expect(DIBAY_ANDROID_PLAY_STORE_PUBLIC).toBe(true);
    const landing = read("app/(main)/download/AppDownloadLanding.tsx");
    expect(landing).toContain("DIBAY_ANDROID_PLAY_STORE_PUBLIC ?");
    const page = read("app/(main)/download/page.tsx");
    expect(page).toContain('"apple-itunes-app"');
  });

  it("MY 설정에 「공유하기」 행 1개(버전 바로 위) · 연락처 초대도 같은 링크", () => {
    const settings = MYPAGE_IA_CATEGORIES.find((c) => c.id === "settings")!;
    const rows = settings.groups[0]!.rows;
    const i = rows.findIndex((r) => "kind" in r && r.kind === "share-app");
    expect(i).toBeGreaterThan(-1);
    const next = rows[i + 1]!;
    expect("href" in next ? next.href : null).toBe("/mypage/section/settings/version");
    const contacts = read("components/community-messenger/contacts/MessengerContactsScreen.tsx");
    expect(contacts).toContain('buildShareUrl({ kind: "app" })');
    expect(contacts).not.toContain("shareCommunityPostViaNative");
  });

  it("스티커 QR 1개 — /download?go=1 이 기기별 스토어로 이동", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
    const android = "Mozilla/5.0 (Linux; Android 14; SM-M156S) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36";
    const ipadDesktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
    expect(resolveDeviceStoreUrl(iphone)).toBe(DIBAY_IOS_APP_STORE_REDIRECT_URL);
    expect(DIBAY_IOS_APP_STORE_REDIRECT_URL).toBe("https://apps.apple.com/ph/app/id6831952401");
    expect(resolveDeviceStoreUrl(android)).toBe(DIBAY_ANDROID_PLAY_STORE_URL);
    expect(resolveDeviceStoreUrl(ipadDesktop, 5)).toBe(DIBAY_IOS_APP_STORE_REDIRECT_URL);
    expect(resolveDeviceStoreUrl(ipadDesktop, 0)).toBeNull();
    expect(resolveDeviceStoreUrl("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBeNull();
    const landing = read("app/(main)/download/AppDownloadLanding.tsx");
    expect(landing).toContain("resolveDeviceStoreUrl(");
    expect(landing).toContain("if (native) return;");
    const page = read("app/(main)/download/page.tsx");
    expect(page).toContain("resolveDeviceStoreUrl(ua)");
    expect(page).toContain("redirect(store)");
    const proxy = read("proxy.ts");
    expect(proxy).toContain("resolveDeviceStoreUrl(request.headers.get(\"user-agent\")");
    expect(proxy).toContain("NextResponse.redirect(store, 307)");
  });
});
