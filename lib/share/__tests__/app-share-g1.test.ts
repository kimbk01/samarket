import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isGuestPublicBrowsePath } from "@/lib/auth/guest-browse-access-policy";
import {
  DIBAY_ANDROID_PLAY_STORE_PUBLIC,
  DIBAY_APP_LANDING_PATH,
  DIBAY_IOS_APP_STORE_URL,
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

  it("스토어 주소 — iOS ID 6831952401, Android 설치 버튼은 Play 공개 확인 전 보류(G-13)", () => {
    expect(DIBAY_IOS_APP_STORE_URL).toBe("https://apps.apple.com/app/id6831952401");
    expect(DIBAY_ANDROID_PLAY_STORE_PUBLIC).toBe(false);
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
});
