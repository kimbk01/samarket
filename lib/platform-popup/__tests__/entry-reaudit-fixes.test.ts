/**
 * 진입 감사 재감사 (2026-11-17) — 빌드 전 검증에서 찾은 결함 수정 · 그림·글 규격.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  POPUP_BODY_MAX,
  POPUP_CTA_LABEL_MAX,
  POPUP_SOURCE_MAX_MB,
  POPUP_TITLE_MAX,
  checkPopupCopyLengths,
  checkPopupCreativeSourceSize,
  popupCreativeSpecForComposition,
} from "@/lib/platform-popup/creative-size-spec";
import { sameRevision } from "@/lib/admin/same-revision";
import { selectLiveLaunchIntroPoolRows } from "@/lib/launch-intro/pool";
import { isLifecycleAuthSurfacePath } from "@/lib/startup/lifecycle-nav-hold";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("팝업 그림 규격", () => {
  it("카드: 36:25 로 자른 뒤 720×500 미만 거절 · 4천만 화소 초과 거절", () => {
    expect(checkPopupCreativeSourceSize({ creativeMode: "card", width: 1440, height: 1000 })).toEqual({ ok: true });
    expect(checkPopupCreativeSourceSize({ creativeMode: "card", width: 720, height: 500 })).toEqual({ ok: true });
    expect(checkPopupCreativeSourceSize({ creativeMode: "card", width: 700, height: 1000 }).ok).toBe(false);
    // 아주 긴 가로 그림 — 자르면 높이가 모자람
    expect(checkPopupCreativeSourceSize({ creativeMode: "card", width: 4000, height: 400 }).ok).toBe(false);
    expect(checkPopupCreativeSourceSize({ creativeMode: "card", width: 9000, height: 6000 })).toEqual({
      ok: false,
      error: "popup_image_too_many_pixels",
    });
  });
  it("그림형: 긴 변 720 이상", () => {
    expect(checkPopupCreativeSourceSize({ creativeMode: "artwork", width: 720, height: 300 })).toEqual({ ok: true });
    expect(checkPopupCreativeSourceSize({ creativeMode: "artwork", width: 600, height: 600 }).ok).toBe(false);
  });
  it("형태별 안내가 검사와 같은 값", () => {
    expect(popupCreativeSpecForComposition("promotion_card_modal")).toMatchObject({ ratio: "36:25", minimum: "720×500" });
    expect(popupCreativeSpecForComposition("artwork_full")).toMatchObject({ ratio: null, minimum: "720", transparent: true });
    expect(POPUP_SOURCE_MAX_MB).toBe(8);
  });
});

describe("팝업 글 규격", () => {
  it("넘으면 거절(자르지 않음) · 글자 수는 문자 단위", () => {
    expect(checkPopupCopyLengths({ title: "가".repeat(POPUP_TITLE_MAX) })).toEqual({ ok: true });
    expect(checkPopupCopyLengths({ title: "가".repeat(POPUP_TITLE_MAX + 1) })).toEqual({ ok: false, error: "title_too_long" });
    expect(checkPopupCopyLengths({ body: "a".repeat(POPUP_BODY_MAX + 1) })).toEqual({ ok: false, error: "body_too_long" });
    expect(checkPopupCopyLengths({ ctaLabel: "b".repeat(POPUP_CTA_LABEL_MAX + 1) })).toEqual({
      ok: false,
      error: "cta_label_too_long",
    });
  });
  it("저장 경로가 검사를 쓴다 · 어드민 입력 칸에 길이 제한", () => {
    expect(src("lib/platform-popup/admin-campaign-writer.ts")).toContain("checkPopupCopyLengths(");
    expect(src("app/api/admin/platform-popup-campaigns/[campaignId]/creative/route.ts")).toContain(
      "checkPopupCreativeSourceSize("
    );
    const ws = src("components/admin/platform-popup/AdminPlatformPopupDetailWorkspace.tsx");
    expect(ws).toContain("maxLength={POPUP_TITLE_MAX}");
    expect(ws).toContain("maxLength={POPUP_BODY_MAX}");
    expect(ws).toContain("maxLength={POPUP_CTA_LABEL_MAX}");
    expect(ws).toContain("popupCreativeSpecForComposition(operatorComposition)");
  });
});

describe("판 비교(거짓 409 방지)", () => {
  it("같은 시각의 다른 표기는 같은 판", () => {
    expect(sameRevision("2026-11-17T03:00:00.123Z", "2026-11-17T03:00:00.123+00:00")).toBe(true);
    expect(sameRevision("2026-11-17T03:00:00.123Z", "2026-11-17T03:00:00.124Z")).toBe(false);
    expect(sameRevision(null, null)).toBe(true);
    expect(sameRevision(null, "2026-11-17T03:00:00Z")).toBe(false);
  });
});

describe("인트로 묶음 — 지금 보일 소재가 먼저", () => {
  it("시작 전 소재가 20칸을 차지하지 않는다", () => {
    const now = new Date("2026-11-17T00:00:00Z");
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `f${String(i).padStart(2, "0")}`,
        status: "active",
        start_at: "2026-12-01T00:00:00Z",
        end_at: null,
        sort_order: 0,
      })),
      { id: "now", status: "active", start_at: null, end_at: null, sort_order: 99 },
    ];
    expect(selectLiveLaunchIntroPoolRows(rows, now)[0].id).toBe("now");
  });
});

describe("구조 확인(코드)", () => {
  it("팝업 조회: 전체 설정을 후보 읽기 전에 · 건너뛴 후보는 다음 칸에서 제외", () => {
    const r = src("app/api/platform-popup/resolve/route.ts");
    expect(r.indexOf("loadPlatformPopupEntryPolicyCached()")).toBeLessThan(r.indexOf("loadPlatformPopupCandidates(sb"));
    expect(r).toContain("picked.skippedCampaignIds");
  });
  it("캠페인 복사가 새 칸을 함께 복사", () => {
    const w = src("lib/platform-popup/admin-campaign-writer.ts");
    for (const k of ["queue_class:", "auto_dismiss_seconds:", "list_store_ids:", "tooltip_anchor:", "cta_bg_color:"]) {
      expect(w).toContain(k);
    }
  });
  it("호스트: 못 보인 칸은 다음 칸 또는 연속 잠금 · 말풍선은 화면 이동 시 걷힘", () => {
    const h = src("components/platform-popup/GlobalPopupHost.tsx");
    expect(h).toContain("const skipCurrent = useCallback(");
    expect(h).toContain('winner.presentationType === "tooltip" && shownPathRef.current !== pathname');
  });
  it("로그인 화면 목록은 한 곳", () => {
    expect(isLifecycleAuthSurfacePath("/login?next=/home")).toBe(true);
    expect(isLifecycleAuthSurfacePath("/home")).toBe(false);
    expect(src("lib/lifecycle/lifecycle-route-effects.client.ts")).not.toContain('p === "/login"');
  });
  it("네이티브: 아이콘 실행만 · 한 프로세스 1번 · 상한 10초 · 뒤로=건너뛰기 · 백업 제외 · 부분 동기화", () => {
    const a = src("android/app/src/main/java/com/dibay/app/DibayNativeIntro.java");
    const m = src("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(m).toContain("!DibayNativeIntro.processSelectionDone() && isLauncherLaunch(getIntent())");
    expect(a).toContain("HARD_CAP_MS = 10_000");
    expect(a).toContain("OnBackPressedCallback");
    expect(a).toContain("getNoBackupFilesDir()");
    expect(a).toContain("anyFailed = true;");
    expect(a).toContain("/ sample > target");
    const i = src("ios/App/App/Plugins/DibayNativeIntroPlugin.swift");
    expect(i).toContain("hardCapMs = 10_000");
    expect(i).toContain("isExcludedFromBackup = true");
    expect(i).toContain("CGImageSourceCreateThumbnailAtIndex");
    expect(i).toContain('DispatchQueue(label: "dibay.native-intro.sync")');
    expect(src("ios/App/App/SceneDelegate.swift")).toContain("cancelForSpecialLaunch()");
  });
});
