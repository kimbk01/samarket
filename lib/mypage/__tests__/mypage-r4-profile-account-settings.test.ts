/**
 * R4 (S01–S19) 단위·계약 테스트 — 최종 설계 Part B 「완료 검증」 항목 중 순수 규칙·소스 계약.
 * 화면 상호작용은 `components/mypage/__tests__/mypage-r4-screens.test.tsx`.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  resolveProfileEditNicknameIssue,
  resolveProfileEditSheetSaveState,
} from "@/lib/profile/profile-edit-form-helpers";
import {
  MYPAGE_PROFILE_EDIT_SHEET_HREF,
  isMypageProfileEditSheetRequest,
} from "@/lib/mypage/mypage-profile-routes";
import { maskProfilePhoneForDisplay } from "@/lib/mypage/mask-profile-phone";
import { resolveMemberPhoneState } from "@/lib/profile/member-account-status";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import {
  canUnlinkAuthProvider,
  countLinkedAuthProviders,
  shouldScrollToLinkedLogin,
} from "@/lib/mypage/fetch-me-auth-providers";
import { loadPhoneVerificationState } from "@/lib/mypage/load-phone-verification-state";
import { saveDualNotificationToggle } from "@/lib/mypage/notification-toggle-dual-save";
import { buildUserRelationDeleteUrl, userRelationReleaseNeedsConfirm } from "@/lib/mypage/user-relation-release";
import { clearAppClientCaches, isClearableLocalCacheKey } from "@/lib/mypage/clear-app-client-caches";
import { isMypageItemWithoutHubWait } from "@/lib/mypage/mypage-item-hub-wait";
import { resolveVersionScreenCta } from "@/lib/platform/android-play-version-screen-cta";
import {
  ACCOUNT_DELETION_CONFIRMATION_TOKEN,
  isAccountDeletionConfirmationValid,
} from "@/lib/account/account-deletion-contract";
import { MYPAGE_MOTION_MS } from "@/lib/mypage/mypage-authority-contract";
import type { ProfileRow } from "@/lib/profile/types";

const root = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("S01 프로필 수정 — 단일 시트·[저장] 활성 규칙", () => {
  const baseline = { nickname: "민지", bio: "안녕" };

  it("변경 없으면 비활성, 바뀌고 검증 통과면 활성", () => {
    expect(resolveProfileEditSheetSaveState({ baseline, nickname: "민지", bio: "안녕" }).canSave).toBe(false);
    expect(resolveProfileEditSheetSaveState({ baseline, nickname: " 민지 ", bio: "안녕 " }).dirty).toBe(false);
    expect(resolveProfileEditSheetSaveState({ baseline, nickname: "민지2", bio: "안녕" }).canSave).toBe(true);
    expect(resolveProfileEditSheetSaveState({ baseline, nickname: "민지", bio: "새 소개" }).canSave).toBe(true);
  });

  it("닉네임 공백·2자 미만·21자 → 비활성 + 이유", () => {
    expect(resolveProfileEditSheetSaveState({ baseline, nickname: "   ", bio: "안녕" })).toMatchObject({
      dirty: true,
      nicknameIssue: "required",
      canSave: false,
    });
    expect(resolveProfileEditSheetSaveState({ baseline, nickname: "a", bio: "안녕" }).nicknameIssue).toBe("min");
    expect(resolveProfileEditNicknameIssue("x".repeat(21))).toBe("max");
    expect(resolveProfileEditNicknameIssue("x".repeat(20))).toBeNull();
    expect(resolveProfileEditSheetSaveState({ baseline, nickname: "x".repeat(21), bio: "안녕" }).canSave).toBe(false);
  });

  it("소개 60자 초과 → 비활성, 기준 원본 없으면 비활성", () => {
    expect(resolveProfileEditSheetSaveState({ baseline, nickname: "민지", bio: "가".repeat(61) }).canSave).toBe(false);
    expect(resolveProfileEditSheetSaveState({ baseline: null, nickname: "민지2", bio: "" }).canSave).toBe(false);
  });

  it("`/mypage?edit=profile` 요청 판별", () => {
    expect(MYPAGE_PROFILE_EDIT_SHEET_HREF).toBe("/mypage?edit=profile");
    expect(isMypageProfileEditSheetRequest(new URLSearchParams("edit=profile"))).toBe(true);
    expect(isMypageProfileEditSheetRequest(new URLSearchParams("edit=other"))).toBe(false);
    expect(isMypageProfileEditSheetRequest(null)).toBe(false);
  });

  it("직접 URL 은 시트로 리다이렉트, `?setup=1` 은 페이지 유지", () => {
    for (const rel of ["app/(main)/mypage/edit/page.tsx", "app/(main)/mypage/profile/edit/page.tsx"]) {
      expect(read(rel)).toContain("redirect(MYPAGE_PROFILE_EDIT_SHEET_HREF)");
    }
    const sectionEdit = read("app/(main)/mypage/section/[section]/[item]/edit/page.tsx");
    expect(sectionEdit).toContain("isProfileSetupMode");
    expect(sectionEdit).toContain("redirect(MYPAGE_PROFILE_EDIT_SHEET_HREF)");
    expect(sectionEdit).toContain("<ProfileEditForm");
    // 리다이렉트는 Suspense 밖(실제 HTTP 리다이렉트)
    expect(sectionEdit.indexOf("redirect(MYPAGE_PROFILE_EDIT_SHEET_HREF)")).toBeLessThan(sectionEdit.indexOf("<Suspense"));
  });

  it("홈이 쿼리를 받아 시트를 연다 · 계정·매너 화면 링크는 시트 주소", () => {
    expect(read("app/(main)/my/MyContent.tsx")).toContain("<MypageProfileEditQueryOpener");
    expect(read("components/mypage/trust/MypageTrustContent.tsx")).toContain("MYPAGE_PROFILE_EDIT_SHEET_HREF");
    expect(read("components/mypage/tabs/AccountTab.tsx")).toContain("MYPAGE_PROFILE_EDIT_SHEET_HREF");
  });

  it("시트 280ms(X10) · 핸들 끌어 닫기 · 하단 고정 footer · 미저장 확인", () => {
    expect(MYPAGE_MOTION_MS.sheet).toBe(280);
    const shell = read("components/mypage/profile-settings/MypageBottomSheetShell.tsx");
    expect(shell).toContain("transition-duration:280ms");
    expect(shell).toContain("mypage-sheet-drag-handle");
    expect(shell).toContain("footer={footer}");
    const sheet = read("components/mypage/profile-settings/EditPublicProfileSheet.tsx");
    expect(sheet).toContain("resolveProfileEditSheetSaveState");
    expect(sheet).toContain("mypage_s01_discard_title");
    expect(sheet).not.toContain("PROFILE_EDIT_PRIMARY_BTN_CLASS");
    expect(sheet).not.toContain('t("common_loading")');
    const photo = read("components/my/edit/ProfileImageField.tsx");
    expect(photo).toContain("DibayActionSheet");
    expect(photo).toContain('capture="user"');
    expect(photo).toContain("ensureCameraWithDiBaYGate");
  });
});

describe("S03 계정 — 마스킹·인증 표시·가입일", () => {
  it("+63 10자리 마스킹 · 빈 값 · 국가코드 없음", () => {
    expect(maskProfilePhoneForDisplay("+63 912 345 6789")).toBe("+63 9** *** 6789");
    expect(maskProfilePhoneForDisplay("")).toBe("");
    expect(maskProfilePhoneForDisplay(null)).toBe("");
    expect(maskProfilePhoneForDisplay("0912 345 6789")).toBe("0*** *** 6789");
    expect(maskProfilePhoneForDisplay("12345")).toBe("*2345");
  });

  it("인증·번호 조합 — 인증됨이면 번호 유무와 무관하게 verified (공용 resolveMemberPhoneState)", () => {
    expect(resolveMemberPhoneState({ phone: "09123456789", phone_verified: true })).toEqual({
      kind: "verified",
      verified: true,
      masked: "+63 9** *** 6789",
    });
    expect(resolveMemberPhoneState({ phone: null, phone_verified: true })).toEqual({
      kind: "verified",
      verified: true,
      masked: null,
    });
    expect(resolveMemberPhoneState({ phone: "09123456789", phone_verified: false }).kind).toBe(
      "unverified_with_number",
    );
    expect(resolveMemberPhoneState({ phone: null, phone_verified: false }).kind).toBe("unverified");
  });

  it("가입일 포맷 ko/en (필리핀 시간)", () => {
    expect(formatMypageDate("2025-01-31T20:00:00Z", { lang: "ko" })).toMatch(/2025.*2.*1/);
    expect(formatMypageDate("2025-01-31T20:00:00Z", { lang: "en" })).toMatch(/Feb.*1.*2025/);
  });

  it("연동 로그인 수·해제 가능 규칙·#linked-login 앵커", () => {
    const rows = [
      { provider: "google" as const, linked: true, linkedAt: null },
      { provider: "kakao" as const, linked: false, linkedAt: null },
    ];
    expect(countLinkedAuthProviders(rows)).toBe(1);
    expect(canUnlinkAuthProvider(rows[0], 1)).toBe(false);
    expect(canUnlinkAuthProvider(rows[0], 2)).toBe(true);
    expect(canUnlinkAuthProvider(rows[1], 2)).toBe(false);
    expect(shouldScrollToLinkedLogin("#linked-login")).toBe(true);
    expect(shouldScrollToLinkedLogin("")).toBe(false);
    const account = read("components/my/MyAccountContent.tsx");
    expect(account).toContain("MYPAGE_LINKED_LOGIN_HREF");
    expect(account).not.toMatch(/rounded-\[20px\]|bg-\[rgba/);
    expect(account).not.toContain("account_to_settings");
  });
});

describe("S05 전화 인증 — 무한 로딩 금지", () => {
  const profile = { id: "u1" } as ProfileRow;
  const okSettings = () =>
    new Response(JSON.stringify({ ok: true, verification: { settings: { enabled: true, guide_text: "" } } }), {
      status: 200,
    });

  it("프로필 null → 오류", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okSettings()));
    const r = await loadPhoneVerificationState({ loadProfile: async () => null });
    expect(r).toEqual({ ok: false, reason: "profile_failed" });
    vi.unstubAllGlobals();
  });

  it("설정 조회 실패(HTTP 500) → 오류", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const r = await loadPhoneVerificationState({ loadProfile: async () => profile });
    expect(r).toEqual({ ok: false, reason: "settings_failed" });
    vi.unstubAllGlobals();
  });

  it("fetch 거부 → 오류(로딩 고착 없음)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const r = await loadPhoneVerificationState({ loadProfile: async () => profile });
    expect(r.ok).toBe(false);
    vi.unstubAllGlobals();
  });

  it("프로필 조회가 끝나지 않으면 타임아웃 → 오류", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okSettings()));
    const r = await loadPhoneVerificationState({
      timeoutMs: 10,
      loadProfile: () => new Promise<ProfileRow | null>(() => undefined),
    });
    expect(r).toEqual({ ok: false, reason: "timeout" });
    vi.unstubAllGlobals();
  });

  it("둘 다 성공 → ready", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okSettings()));
    const r = await loadPhoneVerificationState({ loadProfile: async () => profile });
    expect(r.ok).toBe(true);
    vi.unstubAllGlobals();
  });

  it("페이지 소스 — 이전 고착 조건 제거", () => {
    const page = read("components/mypage/required/MypageRequiredPhoneClient.tsx");
    expect(page).not.toContain("loading || !snapshot");
    expect(page).toContain("loadPhoneVerificationState");
    const box = read("components/mypage/profile/PhoneVerificationBox.tsx");
    expect(box).toContain('autoComplete="one-time-code"');
    expect(box).toContain("setInterval");
  });
});

describe("S11 알림 — 저장 실패 되돌림", () => {
  it("한쪽 실패 → 둘 다 되돌림(성공한 쪽 원래 값 재저장)", async () => {
    const saveUser = vi.fn(async (_v: boolean) => true);
    const saveDomain = vi.fn(async (_v: boolean) => false);
    const ok = await saveDualNotificationToggle({ next: false, prev: true, saveUser, saveDomain });
    expect(ok).toBe(false);
    expect(saveUser.mock.calls).toEqual([[false], [true]]);
    expect(saveDomain.mock.calls).toEqual([[false]]);
  });

  it("둘 다 성공 → true, 되돌림 없음 / 둘 다 실패 → 되돌림 저장 없음", async () => {
    const a = vi.fn(async (_v: boolean) => true);
    const b = vi.fn(async (_v: boolean) => true);
    expect(await saveDualNotificationToggle({ next: true, prev: false, saveUser: a, saveDomain: b })).toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
    const c = vi.fn(async (_v: boolean) => false);
    const d = vi.fn(async (_v: boolean): Promise<boolean> => {
      throw new Error("x");
    });
    expect(await saveDualNotificationToggle({ next: true, prev: false, saveUser: c, saveDomain: d })).toBe(false);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it("도메인 토글 실패를 무시하지 않는다(소스 계약)", () => {
    const src = read("components/my/settings/NotificationsSettingsContent.tsx");
    expect(src).not.toContain("/* ignore */");
    expect(src).toContain("MyToggle");
    expect(src).toContain("saveDualNotificationToggle");
    expect(src).toContain("kasama:user-notification-settings-changed");
  });
});

describe("S14 관심·차단·숨김 — 해제 API·확인", () => {
  it("차단 해제는 targetUserId 를 보낸다(서버 계약)", () => {
    expect(buildUserRelationDeleteUrl("blocked", { id: "r1", targetId: "u9" })).toBe(
      "/api/me/relations/blocked?id=r1&targetUserId=u9",
    );
    expect(buildUserRelationDeleteUrl("hidden", { id: "r2", targetId: "u9" })).toBe("/api/me/relations/hidden?id=r2");
  });

  it("관심·차단·숨김은 확인 시트, 이웃은 기존 즉시 해제", () => {
    expect(userRelationReleaseNeedsConfirm("favorite")).toBe(true);
    expect(userRelationReleaseNeedsConfirm("blocked")).toBe(true);
    expect(userRelationReleaseNeedsConfirm("hidden")).toBe(true);
    expect(userRelationReleaseNeedsConfirm("neighbor")).toBe(false);
  });
});

describe("S17 캐시 삭제 — 레지스트리 키만", () => {
  it("레지스트리 키만 지우고 초안·로그인·권한·주소 흐름·미등록 키는 보존", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const keepLocal = {
      "sb-proj-auth-token": "token",
      "samarket:app-language": "ko",
      "samarket:trade-write-form-local:cat1": "{draft}",
      "unregistered:any-cache-key": "x",
    };
    const keepSession = {
      "samarket:trade-write-form:cat1": "{draft}",
      "samarket:business-apply-form-draft:v1": "{draft}",
      "dibay.permission.session.camera": "1",
      "samarket:address-mgmt-exit": "/write",
      "dibay.address.platform.v2.draft": "{}",
      "dibay.address.edit.draft.v3:u1:new": "{}",
      "samarket:post_logout_guard": "1",
      "some-unknown-session-key": "1",
    };
    for (const [k, v] of Object.entries(keepLocal)) localStorage.setItem(k, v);
    for (const [k, v] of Object.entries(keepSession)) sessionStorage.setItem(k, v);
    /** 주소 목록 캐시는 sessionStorage (SSOT-009) */
    sessionStorage.setItem("samarket:me-addresses-list-cache:v1", "[]");
    localStorage.setItem("temp_x", "[]");
    localStorage.setItem("cache_feed", "[]");
    sessionStorage.setItem("dibay:mypage-summary:u1", "{}");
    sessionStorage.setItem("dibay:mypage-list:/mypage/offers", "{}");
    sessionStorage.setItem("dibay:mypage-hub-scroll", "{}");

    const r = await clearAppClientCaches();
    expect(r.localKeys).toBe(2);
    expect(r.sessionKeys).toBe(4);
    for (const [k, v] of Object.entries(keepLocal)) expect(localStorage.getItem(k)).toBe(v);
    for (const [k, v] of Object.entries(keepSession)) expect(sessionStorage.getItem(k)).toBe(v);
    expect(sessionStorage.getItem("samarket:me-addresses-list-cache:v1")).toBeNull();
    expect(sessionStorage.getItem("dibay:mypage-summary:u1")).toBeNull();
  });

  it("sessionStorage 전체 삭제 금지(소스 계약)", () => {
    expect(read("lib/mypage/clear-app-client-caches.ts")).not.toContain("sessionStorage.clear()");
    expect(isClearableLocalCacheKey("samarket:messenger-home-warm-cache-ready")).toBe(false);
  });
});

describe("S18 버전 — Android 에서만 업데이트 버튼", () => {
  const base = {
    loading: false,
    checking: false,
    updating: false,
    freshness: "unavailable" as const,
    updateInfo: null,
    installStatus: null,
    userCanceled: false,
    hasCheckError: false,
  };
  it("비Android(iOS·웹) → 버튼 없음, Android → 버튼", () => {
    expect(resolveVersionScreenCta({ ...base, platformIsAndroidNative: false }).showPrimaryButton).toBe(false);
    expect(resolveVersionScreenCta({ ...base, platformIsAndroidNative: true, freshness: "latest" }).showPrimaryButton).toBe(
      true,
    );
  });
  it("iOS 문구에 App Store 없음 · HARD LOCK 비활성 색 유지", () => {
    const src = read("components/my/settings/VersionContent.tsx");
    expect(src).not.toContain("App Store");
    expect(src).toContain("#D1D5DB");
    expect(src).toContain("#6B7280");
    expect(src).toContain("version-web-deploy-sha");
  });
});

describe("S19 탈퇴 — 공용 확인 상수", () => {
  it("API 와 클라이언트가 같은 상수", () => {
    expect(ACCOUNT_DELETION_CONFIRMATION_TOKEN).toBe("계정삭제");
    expect(isAccountDeletionConfirmationValid(" 계정삭제 ")).toBe(true);
    expect(isAccountDeletionConfirmationValid("delete")).toBe(false);
    expect(read("app/api/me/leave-request/route.ts")).toContain("isAccountDeletionConfirmationValid");
  });
});

describe("섹션 화면 — 정적 화면 hub 대기 0 · core 로더", () => {
  it("S10~S19 정적·설정 화면은 hub 데이터를 기다리지 않는다", () => {
    for (const item of [
      "device-permissions",
      "notifications",
      "language",
      "country",
      "video-autoplay",
      "personalization",
      "chat-settings",
      "cache",
      "version",
      "leave",
    ]) {
      expect(isMypageItemWithoutHubWait("settings", item), item).toBe(true);
    }
    for (const item of ["favorite-users", "blocked-users", "hidden-users"]) {
      expect(isMypageItemWithoutHubWait("account", item)).toBe(true);
    }
    expect(isMypageItemWithoutHubWait("store", "payment")).toBe(false);
  });

  it("서버는 loadMypageServerShell, 클라는 전체 '로딩' 가림 없음", () => {
    const page = read("app/(main)/mypage/section/[section]/[item]/page.tsx");
    expect(page).toContain("loadMypageServerShell");
    expect(page).not.toMatch(/loadMypageServer\(\)/);
    expect(page).not.toContain("MainFeedRouteLoading");
    const client = read("components/mypage/MyPageItemRouteClient.tsx");
    expect(client).not.toContain("mypage_comp_loading_ellipsis");
    expect(client).toContain("MyPageItemStaticContent");
  });
});
