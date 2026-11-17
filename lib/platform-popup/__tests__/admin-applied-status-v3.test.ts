/**
 * 앱 진입 어드민 v3 ④ — 팝업 「앱에 나오나」 (서버 계산) · 앱 조회와 같은 자격 함수 · 자르기 틀 검사.
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이유·상태 문구 키 확인
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { computePlatformPopupAppliedStatus } from "@/lib/platform-popup/admin-applied-status";
import {
  platformPopupAppliedOperatorStatus,
  platformPopupAppliedReasonKey,
  platformPopupAppliedStatusFromRow,
} from "@/lib/platform-popup/admin-applied-status-contract";
import {
  evaluatePlatformPopupCandidateGates,
  resolvePopupAd,
  type PlatformPopupCandidate,
} from "@/lib/platform-popup/resolve-popup-ad";
import {
  parsePlatformPopupCropRectFields,
  validatePlatformPopupCropRect,
} from "@/lib/platform-popup/creative-pipeline-geometry";
import { processPlatformPopupCreativeToCanonical } from "@/lib/platform-popup/creative-pipeline";
import { MESSAGES } from "@/lib/i18n/messages";

const NOW = new Date("2026-11-17T04:00:00.000Z");
const BENEFIT = { title: "2,000 off", body: null };

function cand(overrides: Partial<PlatformPopupCandidate> = {}): PlatformPopupCandidate {
  return {
    id: "c1",
    status: "active",
    approvalStatus: "approved",
    priority: 1,
    startAt: "2026-11-01T00:00:00.000Z",
    endAt: "2026-12-01T00:00:00.000Z",
    timezone: "Asia/Manila",
    surfaces: ["GLOBAL"],
    presentationType: "center_modal",
    frequencyMode: "once_per_day",
    creative: {
      id: "cr1",
      status: "ready",
      aspectW: 36,
      aspectH: 25,
      creativeMode: "card",
      assetUrl: "https://cdn.test/a.webp",
    },
    ctaType: "internal_page",
    ctaTarget: "/market",
    ctaLookup: { exists: true, visible: true, authorized: true },
    ...overrides,
  };
}

const applied = (c: PlatformPopupCandidate, extra: Partial<Parameters<typeof computePlatformPopupAppliedStatus>[0]> = {}) =>
  computePlatformPopupAppliedStatus({ candidate: c, now: NOW, policyEnabled: true, ...extra });

describe("v3 ④ 「앱에 나오나」 — 조건마다 첫 이유", () => {
  it("모두 통과 = 나오는 중", () => {
    expect(applied(cand())).toEqual({ state: "live", reason: null });
  });

  it("전체 설정 꺼짐 = 안 나옴(첫 이유)", () => {
    expect(applied(cand(), { policyEnabled: false })).toEqual({ state: "not_shown", reason: "policy_disabled" });
  });

  it("승인 · 상태", () => {
    expect(applied(cand({ approvalStatus: "pending_review" })).reason).toBe("not_approved");
    expect(applied(cand({ status: "paused" })).reason).toBe("status_inactive");
  });

  it("기간 — 끝남 = 안 나옴 · 시작 전 = 예약(시작 시각)", () => {
    expect(applied(cand({ endAt: "2026-11-10T00:00:00.000Z" }))).toEqual({ state: "not_shown", reason: "schedule_ended" });
    const s = applied(cand({ startAt: "2026-11-20T00:00:00.000Z" }));
    expect(s.state).toBe("scheduled");
    expect(s.reason).toBe("starts_at");
    expect(s.startsAt).toBe("2026-11-20T00:00:00.000Z");
  });

  it("예약이어도 다른 조건이 틀리면 안 나옴(그 이유)", () => {
    const s = applied(
      cand({ startAt: "2026-11-20T00:00:00.000Z", ctaType: "store", ctaTarget: "cafe", ctaLookup: { exists: false, visible: false } })
    );
    expect(s).toMatchObject({ state: "not_shown", reason: "cta_invalid", ctaError: "target_deleted" });
  });

  it("노출 위치 없음 · 신청 매장 자격 · 그림 없음 · 그림 종류 · 카드 비율", () => {
    expect(applied(cand({ surfaces: [] })).reason).toBe("surface_none");
    expect(applied(cand({ ownerStoreEligible: false })).reason).toBe("owner_store_ineligible");
    expect(applied(cand({ creative: null })).reason).toBe("creative_missing");
    expect(
      applied(cand({ creative: { id: "x", status: "ready", aspectW: 1280, aspectH: 320, creativeMode: "ptr_band" } })).reason
    ).toBe("creative_mode_mismatch");
    expect(
      applied(cand({ creative: { id: "x", status: "ready", aspectW: 1080, aspectH: 1080, creativeMode: "card" } })).reason
    ).toBe("creative_aspect_invalid");
    expect(applied(cand({ presentationType: "inline_banner" })).reason).toBe("presentation_out_of_scope");
  });

  it("이동할 곳 — 삭제·비공개·기간 끝남은 이유 문구가 다르다", () => {
    const hidden = applied(cand({ ctaType: "store", ctaTarget: "cafe", ctaLookup: { exists: true, visible: false } }));
    expect(hidden).toMatchObject({ state: "not_shown", reason: "cta_invalid", ctaError: "target_hidden" });
    expect(platformPopupAppliedReasonKey(hidden)).toBe("admin_popup_applied_reason_cta_hidden");
    const expired = applied(
      cand({ ctaType: "event_detail", ctaTarget: "11111111-1111-1111-1111-111111111111", ctaLookup: { exists: true, visible: true, expired: true } })
    );
    expect(platformPopupAppliedReasonKey(expired)).toBe("admin_popup_applied_reason_cta_expired");
  });

  it("혜택 다이얼로그 = 이벤트 혜택 필요 · 그림 주소 없음 = 그릴 수 없음", () => {
    const benefitCand = cand({
      presentationType: "benefit_dialog",
      ctaType: "event_detail",
      ctaTarget: "11111111-1111-1111-1111-111111111111",
    });
    expect(applied(benefitCand, { eventBenefit: null }).reason).toBe("benefit_content_required");
    expect(applied(benefitCand, { eventBenefit: BENEFIT }).state).toBe("live");
    expect(
      applied(cand({ creative: { id: "x", status: "ready", aspectW: 36, aspectH: 25, creativeMode: "card", assetUrl: null, assetPath: null } }))
        .reason
    ).toBe("presentation_invalid");
  });

  it("하단 목록 = 노출 자격 매장 1곳 이상 · 쿠폰 카드 = 조건부 · 말풍선 = 홈 없으면 안 나옴(A1)", () => {
    const art = { id: "a", status: "ready" as const, aspectW: 1080, aspectH: 480, creativeMode: "artwork", assetUrl: "https://cdn.test/a.webp" };
    const list = cand({ presentationType: "list_sheet", creative: art });
    expect(applied(list, { listStoreCount: 0 })).toEqual({ state: "not_shown", reason: "list_stores_empty" });
    expect(applied(list, { listStoreCount: 2 }).state).toBe("live");
    expect(applied(cand({ presentationType: "coupon_card", creative: art }))).toEqual({
      state: "conditional",
      reason: "coupon_members_only",
    });
    expect(applied(cand({ presentationType: "tooltip", creative: art, surfaces: ["TRADE"] }))).toEqual({
      state: "not_shown",
      reason: "tooltip_home_only",
    });
    expect(applied(cand({ presentationType: "tooltip", creative: art, surfaces: ["HOME"] })).state).toBe("live");
    expect(applied(cand({ presentationType: "tooltip", creative: art, surfaces: ["GLOBAL"] })).state).toBe("live");
  });

  it("회원별 숨김·같은 이벤트 조율은 보지 않는다(사람마다 다름)", () => {
    const c = cand({
      suppressions: [{ mode: "TODAY", sessionKey: null, suppressUntil: "2026-11-18T00:00:00.000Z", campaignRevision: null, timezone: null, createdAt: "2026-11-17T00:00:00.000Z" }],
    });
    expect(applied(c).state).toBe("live");
  });

  it("후보가 아닌 행 — 승인·상태로 첫 이유 · 운영 배지도 같은 결과에서", () => {
    const row = (status: string, approvalStatus: string, policyEnabled = true) =>
      platformPopupAppliedStatusFromRow({ status, approvalStatus, policyEnabled });
    expect(row("draft", "not_submitted").reason).toBe("status_draft");
    expect(row("pending_review", "pending_review").reason).toBe("approval_pending");
    expect(row("rejected", "rejected").reason).toBe("approval_rejected");
    expect(row("paused", "approved").reason).toBe("status_paused");
    expect(row("ended", "approved").reason).toBe("status_ended");
    expect(row("approved", "approved").reason).toBe("status_approved_idle");
    expect(row("paused", "approved", false).reason).toBe("policy_disabled");
    expect(platformPopupAppliedOperatorStatus(row("paused", "approved"))).toBe("PAUSED");
    expect(platformPopupAppliedOperatorStatus({ state: "conditional", reason: "coupon_members_only" })).toBe("ACTIVE");
  });

  it("이유·상태 문구 키가 ko·en 카탈로그에 모두 있다", () => {
    const reasons = [
      "policy_disabled", "not_approved", "approval_pending", "approval_rejected", "status_draft",
      "status_approved_idle", "status_paused", "status_ended", "status_inactive", "schedule_not_started",
      "schedule_ended", "starts_at", "surface_none", "surface_mismatch", "presentation_out_of_scope",
      "audience_excluded", "owner_store_ineligible", "creative_missing", "creative_mode_mismatch",
      "creative_aspect_invalid", "cta_invalid", "cta_deleted", "cta_hidden", "cta_expired", "coordinated_away",
      "suppressed", "benefit_content_required", "presentation_invalid", "list_stores_empty",
      "coupon_members_only", "tooltip_home_only", "tooltip_member_only",
    ];
    const ko = MESSAGES.ko as unknown as Record<string, string>;
    const en = MESSAGES.en as unknown as Record<string, string>;
    for (const r of reasons) {
      expect(ko[`admin_popup_applied_reason_${r}`], r).toBeTruthy();
      expect(en[`admin_popup_applied_reason_${r}`], r).toBeTruthy();
    }
    for (const s of ["live", "conditional", "scheduled", "not_shown"]) {
      expect(ko[`admin_popup_applied_state_${s}`]).toBeTruthy();
      expect(en[`admin_popup_applied_state_${s}`]).toBeTruthy();
    }
  });
});

describe("v3 ④ 앱 조회와 같은 자격 함수 (어긋나지 않게)", () => {
  const variants: Array<[string, Partial<PlatformPopupCandidate>]> = [
    ["ok", {}],
    ["draft", { status: "draft", approvalStatus: "not_submitted" }],
    ["ended", { endAt: "2026-11-10T00:00:00.000Z" }],
    ["future", { startAt: "2026-12-10T00:00:00.000Z", endAt: null }],
    ["no surface for trade", { surfaces: ["COMMUNITY"] }],
    ["owner store", { ownerStoreEligible: false }],
    ["no creative", { creative: null }],
    ["bad aspect", { creative: { id: "x", status: "ready", aspectW: 2, aspectH: 1, creativeMode: "card", assetUrl: "https://cdn.test/a.webp" } }],
    ["cta hidden", { ctaType: "store", ctaTarget: "cafe", ctaLookup: { exists: true, visible: false } }],
    ["suppressed today", { suppressions: [{ mode: "TODAY", sessionKey: null, suppressUntil: "2026-11-18T00:00:00.000Z", campaignRevision: null, timezone: null, createdAt: "2026-11-17T00:00:00.000Z" }] }],
  ];

  it.each(variants)("%s — 자격 함수 결과 = 앱 조회 1위 여부", (_name, overrides) => {
    const c = cand(overrides);
    const gate = evaluatePlatformPopupCandidateGates(c, {
      now: NOW,
      scope: "interruptive",
      resolvedSurface: "TRADE",
      viewer: { viewerUserId: null, coordinatedEventIds: null, sessionKey: "s1" },
    });
    const r = resolvePopupAd({ pathname: "/market", now: NOW, sessionKey: "s1", resolvedSurface: "TRADE", candidates: [c] });
    expect(r.ok).toBe(true);
    expect(Boolean(r.ok && r.winner)).toBe(gate.ok);
  });

  it("앱 조회 루프와 어드민 계산이 같은 함수를 부른다", () => {
    const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
    const resolve = read("lib/platform-popup/resolve-popup-ad.ts");
    expect(resolve).toMatch(/for \(const c of input\.candidates\) \{[\s\S]{0,400}evaluatePlatformPopupCandidateGates\(c,/);
    const admin = read("lib/platform-popup/admin-applied-status.ts");
    expect(admin).toContain("evaluatePlatformPopupCandidateGates(");
    expect(admin).toContain("buildPlatformPopupPresentationWinner(");
    expect(admin).toContain("loadPlatformPopupCandidates(");
    expect(admin).toContain("loadPopupCandidateEventBenefit(");
    expect(admin).toContain("loadPlatformPopupListStores(");
    // 앱 조회 표시 단계도 같은 혜택 함수
    expect(read("app/api/platform-popup/resolve/route.ts")).toContain("loadPopupCandidateEventBenefit(sb, candidate)");
  });
});

describe("v3 ④ 자르기 틀 — 검사(화면·서버 같은 함수) · 서버 자르기", () => {
  const src = { width: 2400, height: 1200 };

  it("원본 안 · 36:25 ±1% · 최소 720×500", () => {
    expect(validatePlatformPopupCropRect({ x: 100, y: 0, width: 1728, height: 1200 }, src).ok).toBe(true);
    expect(validatePlatformPopupCropRect({ x: 800, y: 0, width: 1728, height: 1200 }, src)).toEqual({
      ok: false,
      error: "crop_rect_out_of_bounds",
    });
    expect(validatePlatformPopupCropRect({ x: -1, y: 0, width: 1728, height: 1200 }, src)).toEqual({
      ok: false,
      error: "crop_rect_out_of_bounds",
    });
    expect(validatePlatformPopupCropRect({ x: 0, y: 0, width: 1600, height: 1200 }, src)).toEqual({
      ok: false,
      error: "crop_rect_ratio",
    });
    // 1% 안 = 통과 (1440×1000 → 1445×1000 은 0.35%)
    expect(validatePlatformPopupCropRect({ x: 0, y: 0, width: 1445, height: 1000 }, src).ok).toBe(true);
    expect(validatePlatformPopupCropRect({ x: 0, y: 0, width: 576, height: 400 }, src)).toEqual({
      ok: false,
      error: "crop_rect_too_small",
    });
    expect(validatePlatformPopupCropRect({ x: 0.5, y: 0, width: 720, height: 500 }, src)).toEqual({
      ok: false,
      error: "crop_rect_invalid",
    });
  });

  it("폼 값 — 넷 다 없으면 null(가운데 자르기 유지) · 일부만·숫자 아님 = invalid", () => {
    expect(parsePlatformPopupCropRectFields({ x: null, y: null, width: null, height: null })).toEqual({ ok: true, rect: null });
    expect(parsePlatformPopupCropRectFields({ x: "1", y: "2", width: "720", height: "500" })).toEqual({
      ok: true,
      rect: { x: 1, y: 2, width: 720, height: 500 },
    });
    expect(parsePlatformPopupCropRectFields({ x: "1", y: null, width: "720", height: "500" }).ok).toBe(false);
    expect(parsePlatformPopupCropRectFields({ x: "-1", y: "0", width: "720", height: "500" }).ok).toBe(false);
  });

  it("서버 — 고른 부분을 잘라 1440×1000 · 잘못된 틀은 거절 · 틀 없으면 기존 가운데 자르기", async () => {
    const buffer = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#336699" } })
      .png()
      .toBuffer();
    const ok = await processPlatformPopupCreativeToCanonical({
      buffer,
      width: 2400,
      height: 1200,
      applyCenterCrop: false,
      creativeMode: "card",
      cropRect: { x: 600, y: 0, width: 1728, height: 1200 },
    });
    expect(ok).toMatchObject({ ok: true, width: 1440, height: 1000, cropped: true, creativeMode: "card" });

    const out = await processPlatformPopupCreativeToCanonical({
      buffer,
      width: 2400,
      height: 1200,
      applyCenterCrop: false,
      creativeMode: "card",
      cropRect: { x: 1000, y: 0, width: 1728, height: 1200 },
    });
    expect(out).toEqual({ ok: false, error: "crop_rect_out_of_bounds" });

    const small = await processPlatformPopupCreativeToCanonical({
      buffer,
      width: 2400,
      height: 1200,
      applyCenterCrop: false,
      creativeMode: "card",
      cropRect: { x: 0, y: 0, width: 576, height: 400 },
    });
    expect(small).toEqual({ ok: false, error: "crop_rect_too_small" });

    // 틀 없음 + 비율 다름 = 기존처럼 자르기 필요 응답
    const legacy = await processPlatformPopupCreativeToCanonical({
      buffer,
      width: 2400,
      height: 1200,
      applyCenterCrop: false,
      creativeMode: "card",
    });
    expect(legacy).toMatchObject({ ok: false, error: "needs_crop" });
    const center = await processPlatformPopupCreativeToCanonical({
      buffer,
      width: 2400,
      height: 1200,
      applyCenterCrop: true,
      creativeMode: "card",
    });
    expect(center).toMatchObject({ ok: true, width: 1440, height: 1000, cropped: true });
  });

  it("업로드 API 가 자르기 틀 값을 받아 같은 검사로 넘긴다", () => {
    const route = readFileSync(
      path.join(process.cwd(), "app/api/admin/platform-popup-campaigns/[campaignId]/creative/route.ts"),
      "utf8"
    );
    expect(route).toContain("parsePlatformPopupCropRectFields");
    expect(route).toContain('cropRect: creativeMode === "card" ? cropParsed.rect : null');
  });
});
