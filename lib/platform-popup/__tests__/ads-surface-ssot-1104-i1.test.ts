import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 광고 표면 연동 구현 I1(팝업·PTR) — F-2 · F-3 · P-1 · P-2 · P-3 · P-4 · P-6 · P-9 · CX-03 · CX-06 동작 시험 */

vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => {}) }));

import type { PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";
import { resolvePopupAd, selectPlatformPopupEligibleWinner } from "@/lib/platform-popup/resolve-popup-ad";
import {
  popupFrequencyOperatorDescription,
  popupFrequencyOperatorLabel,
} from "@/lib/admin/promotion-ownership-visibility";
import {
  buildPlatformPopupAdminPatch,
  platformPopupPatchReviewGroups,
  platformPopupPatchWouldRevertToReview,
  type PlatformPopupAdminForm,
} from "@/lib/platform-popup/popup-admin-patch";
import { buildPtrRevealAdminPatch, type PtrRevealAdminForm } from "@/lib/platform-popup/ptr-reveal-admin-patch";
import {
  isValidIanaTimezone,
  updatePlatformPopupAdminCampaign,
} from "@/lib/platform-popup/admin-campaign-writer";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";
import { buildPtrRevealAdPayload, ptrRevealAccessibleText } from "@/lib/platform-popup/ptr-reveal-payload";
import { PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS } from "@/lib/platform-popup/admin-surface-target-mode";
import { resolveDibaySurface } from "@/lib/platform-popup/resolve-dibay-surface";
import { isPromotionCoordinationChannel } from "@/lib/platform-promotion-lifecycle/content-visit-contract";
import {
  __resetPtrRevealAdsForTests,
  __setPtrRevealAdForTests,
  listPtrRevealHeldCampaignIds,
  notePtrRevealIdentity,
  readPtrRevealAd,
  finishPtrRevealExposure,
  type PtrRevealAd,
} from "@/lib/platform-popup/ptr-reveal-client";
import { PLATFORM_POPUP_FREQUENCY_MODES } from "@/lib/platform-popup/presentation-contract";

const NOW = new Date("2026-06-01T03:00:00.000Z");

function cand(overrides: Partial<PlatformPopupCandidate> & { id: string }): PlatformPopupCandidate {
  return {
    status: "active",
    approvalStatus: "approved",
    priority: 1,
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2027-01-01T00:00:00.000Z",
    timezone: "Asia/Manila",
    surfaces: ["GLOBAL"],
    creative: { id: `cr-${overrides.id}`, status: "ready", aspectW: 36, aspectH: 25 },
    ctaType: "internal_page",
    ctaTarget: "/market",
    ...overrides,
  };
}

describe("F-2 숨김 판정 = 지금 빈도 기준", () => {
  const campaignRow = { mode: "CAMPAIGN" as const, campaignRevision: null };

  it("once_campaign → once_per_day 로 바꾼 캠페인에 CAMPAIGN 행만 있으면 노출된다", () => {
    const r = resolvePopupAd({
      pathname: "/market",
      now: NOW,
      sessionKey: "s1",
      candidates: [cand({ id: "c1", frequencyMode: "once_per_day", suppressions: [campaignRow] })],
    });
    expect(r.ok && r.winner?.campaignId).toBe("c1");
  });

  it("once_campaign 이면 같은 CAMPAIGN 행이 계속 막는다", () => {
    const r = resolvePopupAd({
      pathname: "/market",
      now: NOW,
      sessionKey: "s1",
      candidates: [cand({ id: "c1", frequencyMode: "once_campaign", suppressions: [campaignRow] })],
    });
    expect(r.ok && r.winner).toBeNull();
  });

  it("once_per_session 은 TODAY 행을 무시하고 SESSION 행만 본다", () => {
    const today = { mode: "TODAY" as const, suppressUntil: "2026-06-02T00:00:00+08:00" };
    const okR = resolvePopupAd({
      pathname: "/market",
      now: NOW,
      sessionKey: "s1",
      candidates: [cand({ id: "c1", frequencyMode: "once_per_session", suppressions: [today] })],
    });
    expect(okR.ok && okR.winner?.campaignId).toBe("c1");
    const blocked = resolvePopupAd({
      pathname: "/market",
      now: NOW,
      sessionKey: "s1",
      candidates: [
        cand({ id: "c1", frequencyMode: "once_per_session", suppressions: [{ mode: "SESSION", sessionKey: "s1" }] }),
      ],
    });
    expect(blocked.ok && blocked.winner).toBeNull();
  });

  it("close_only 는 서버 숨김 행을 무시한다", () => {
    const r = resolvePopupAd({
      pathname: "/market",
      now: NOW,
      sessionKey: "s1",
      candidates: [
        cand({
          id: "c1",
          frequencyMode: "close_only",
          suppressions: [{ mode: "SESSION", sessionKey: "s1" }, campaignRow],
        }),
      ],
    });
    expect(r.ok && r.winner?.campaignId).toBe("c1");
  });

  it("PTR 도 같은 판정 함수(selectPlatformPopupEligibleWinner) — once_campaign→once_per_day 면 CAMPAIGN 행 무시", () => {
    const ptr = (frequencyMode: string) =>
      selectPlatformPopupEligibleWinner(
        {
          pathname: "/market",
          now: NOW,
          sessionKey: "s1",
          candidates: [
            cand({
              id: "p1",
              presentationType: "ptr_reveal",
              frequencyMode,
              creative: { id: "b1", status: "ready", aspectW: 4, aspectH: 1, creativeMode: "ptr_band" },
              suppressions: [campaignRow],
            }),
          ],
        },
        "ptr_reveal"
      );
    expect(ptr("once_per_day").winner?.id).toBe("p1");
    expect(ptr("once_campaign").winner).toBeNull();
  });
});

describe("F-3·P-7·CX-08·CX-09 빈도 이름 정본", () => {
  it("정본 4개 라벨", () => {
    expect(PLATFORM_POPUP_FREQUENCY_MODES.map((m) => popupFrequencyOperatorLabel(m, "ko"))).toEqual([
      "앱 실행당 1회",
      "하루 1회",
      "캠페인 1회",
      "기록 없이 닫기만",
    ]);
  });
  it("정본 밖 값(always 등)은 코드값을 보이지 않는다", () => {
    expect(popupFrequencyOperatorLabel("always", "ko")).toBe("알 수 없음");
  });
  it("선택값별 안내문 — 하루 1회는 24시간 아님, close_only 는 팝업·PTR 다름", () => {
    expect(popupFrequencyOperatorDescription("once_per_day", "ko")).toContain("24시간이 아님");
    expect(popupFrequencyOperatorDescription("once_campaign", "ko")).toContain("이미지·목적지");
    expect(popupFrequencyOperatorDescription("close_only", "ko", "popup")).toContain("이번 앱 실행 동안만");
    expect(popupFrequencyOperatorDescription("close_only", "ko", "ptr")).toContain("다른 화면으로 가면 다시");
  });
});

function popupForm(p: Partial<PlatformPopupAdminForm> = {}): PlatformPopupAdminForm {
  return {
    name: "광고",
    priority: 0,
    timezone: "Asia/Manila",
    startAt: "2026-06-01T00:00:00.000Z",
    endAt: "2026-07-01T00:00:00.000Z",
    surfaces: ["GLOBAL"],
    suppressionMode: "SESSION",
    suppressionDurationSeconds: null,
    presentationType: "center_modal",
    frequencyMode: "once_per_session",
    creativeMode: "card",
    ctaType: "internal_page",
    ctaTarget: "/market",
    externalUrl: null,
    ctaLabel: null,
    title: "제목",
    body: null,
    altText: null,
    ...p,
  };
}

describe("P-1·P-9 팝업 저장 = 바뀐 묶음만 · 재검토 판정 하나", () => {
  it("이름만 바꾸면 name 만 보내고 노출 중이어도 재검토 아님", () => {
    const body = buildPlatformPopupAdminPatch(popupForm(), popupForm({ name: "새 이름" }));
    expect(body).toEqual({ name: "새 이름" });
    expect(platformPopupPatchWouldRevertToReview(body, { status: "active", operatorPopup: true })).toBe(false);
  });
  it("V-18: 노출 중 팝업의 소재(제목)·CTA(이동 위치·버튼 글자)를 바꾸면 재검토", () => {
    const live = { status: "active", operatorPopup: true } as const;
    for (const next of [
      popupForm({ title: "새 제목" }),
      popupForm({ ctaTarget: "/stores" }),
      popupForm({ ctaLabel: "보러 가기" }),
    ]) {
      const body = buildPlatformPopupAdminPatch(popupForm(), next);
      expect(Object.keys(body)).not.toContain("name");
      expect(platformPopupPatchWouldRevertToReview(body, live)).toBe(true);
    }
  });
  it("V-18: 노출 중 팝업의 소재(제목)·CTA(이동 위치·버튼 글자)를 바꾸면 재검토", () => {
    const live = { status: "active", operatorPopup: true } as const;
    for (const next of [
      popupForm({ title: "새 제목" }),
      popupForm({ ctaTarget: "/stores" }),
      popupForm({ ctaLabel: "보러 가기" }),
    ]) {
      const body = buildPlatformPopupAdminPatch(popupForm(), next);
      expect(Object.keys(body)).not.toContain("name");
      expect(platformPopupPatchWouldRevertToReview(body, live)).toBe(true);
    }
  });
  it("아무것도 안 바꾸면 빈 본문", () => {
    expect(buildPlatformPopupAdminPatch(popupForm(), popupForm())).toEqual({});
  });
  it("노출 위치를 바꾸면 surfaces 묶음 → 재검토", () => {
    const body = buildPlatformPopupAdminPatch(popupForm(), popupForm({ surfaces: ["TRADE"] }));
    expect(body).toEqual({ surfaces: ["TRADE"] });
    expect(platformPopupPatchWouldRevertToReview(body, { status: "active", operatorPopup: true })).toBe(true);
  });
  it("대체 텍스트 변경은 altText 로 보낸다(P-2)", () => {
    expect(buildPlatformPopupAdminPatch(popupForm(), popupForm({ altText: "설명" }))).toEqual({ altText: "설명" });
  });
  it("P-9: 운영자 광고 기간 변경은 경고 안 함 · 사장님 신청은 경고", () => {
    const body = buildPlatformPopupAdminPatch(popupForm(), popupForm({ endAt: "2026-08-01T00:00:00.000Z" }));
    expect(platformPopupPatchWouldRevertToReview(body, { status: "active", operatorPopup: true })).toBe(false);
    expect(platformPopupPatchWouldRevertToReview(body, { status: "active", operatorPopup: false })).toBe(true);
  });
  it("P-9: PTR 운영자 기간 변경 본문도 같은 함수로 경고 안 함", () => {
    const base: PtrRevealAdminForm = {
      name: "p",
      priority: 0,
      title: "t",
      ctaLabel: "",
      ctaType: "internal_page",
      ctaTarget: "/market",
      externalUrl: "",
      surfaces: ["GLOBAL"],
      startLocal: "2026-06-01T00:00",
      endLocal: "2026-07-01T00:00",
      frequencyMode: "once_per_session",
      audienceMode: "all",
      audienceUserIdsText: "",
    };
    const body = buildPtrRevealAdminPatch(base, { ...base, endLocal: "2026-08-01T00:00" }, "Asia/Manila");
    expect(platformPopupPatchReviewGroups(body, { operatorPopup: true }).size).toBe(0);
    const freq = buildPtrRevealAdminPatch(base, { ...base, frequencyMode: "once_per_day" }, "Asia/Manila");
    expect(platformPopupPatchWouldRevertToReview(freq, { status: "active", operatorPopup: true })).toBe(true);
  });
});

/** 아주 작은 Supabase 대역 — 테이블 행을 메모리에 두고 select/eq/update/delete/insert/maybeSingle 만 흉내 */
function fakeSb(tables: Record<string, Record<string, unknown>[]>) {
  const calls: { table: string; op: string; values?: unknown }[] = [];
  return {
    calls,
    from(table: string) {
      const filters: [string, unknown][] = [];
      let op = "select";
      let values: unknown = null;
      const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
      const run = () => {
        calls.push({ table, op, values });
        if (op === "update") {
          for (const r of rows()) Object.assign(r, values as object);
          return { data: null, error: null };
        }
        if (op === "delete") {
          tables[table] = (tables[table] ?? []).filter((r) => !filters.every(([k, v]) => r[k] === v));
          return { data: null, error: null };
        }
        if (op === "insert") {
          const list = Array.isArray(values) ? values : [values];
          tables[table] = [...(tables[table] ?? []), ...(list as Record<string, unknown>[])];
          return { data: null, error: null };
        }
        return { data: rows(), error: null };
      };
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return q;
        },
        update: (v: unknown) => {
          op = "update";
          values = v;
          return q;
        },
        delete: () => {
          op = "delete";
          return q;
        },
        insert: (v: unknown) => {
          op = "insert";
          values = v;
          return q;
        },
        maybeSingle: async () => {
          const r = run();
          return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
        },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
      };
      return q;
    },
  };
}

function liveCampaign(extra: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "광고",
    status: "active",
    approval_status: "approved",
    priority: 0,
    start_at: null,
    end_at: null,
    timezone: "Asia/Manila",
    suppression_mode: "SESSION",
    suppression_duration_seconds: null,
    cta_type: "internal_page",
    cta_target: "/market",
    external_url: null,
    presentation_type: "center_modal",
    owner_request_id: null,
    ...extra,
  };
}

describe("P-1·P-2·P-6 서버 writer", () => {
  it("노출 위치가 지금과 같으면 surfacesChanged 아님 → 재검토 없음 · 행도 안 지움", async () => {
    const sb = fakeSb({
      platform_popup_campaigns: [liveCampaign()],
      platform_popup_campaign_surfaces: [{ campaign_id: "c1", surface: "GLOBAL" }],
    });
    const r = await updatePlatformPopupAdminCampaign(sb as never, {
      campaignId: "c1",
      adminUserId: "a",
      patch: { surfaces: ["GLOBAL"], name: "새 이름" },
    });
    expect(r).toMatchObject({ ok: true, revertedToReview: false });
    expect(sb.calls.some((c) => c.table === "platform_popup_campaign_surfaces" && c.op === "delete")).toBe(false);
  });

  it("노출 위치를 실제로 바꾸면 재검토", async () => {
    const sb = fakeSb({
      platform_popup_campaigns: [liveCampaign()],
      platform_popup_campaign_surfaces: [{ campaign_id: "c1", surface: "GLOBAL" }],
    });
    const r = await updatePlatformPopupAdminCampaign(sb as never, {
      campaignId: "c1",
      adminUserId: "a",
      patch: { surfaces: ["TRADE"] },
    });
    expect(r).toMatchObject({ ok: true, revertedToReview: true });
  });

  it("creativeMode 가 지금 소재와 같으면 creative 아님 → 재검토 없음", async () => {
    const sb = fakeSb({
      platform_popup_campaigns: [liveCampaign()],
      platform_popup_creatives: [{ campaign_id: "c1", status: "ready", creative_mode: "card", alt_text: null }],
    });
    const r = await updatePlatformPopupAdminCampaign(sb as never, {
      campaignId: "c1",
      adminUserId: "a",
      patch: { creativeMode: "card" },
    });
    expect(r).toMatchObject({ ok: true, revertedToReview: false });
  });

  it("P-2: altText 를 보내면 준비된 소재 alt_text 를 갱신한다", async () => {
    const tables = {
      platform_popup_campaigns: [liveCampaign({ status: "draft", approval_status: "not_submitted" })],
      platform_popup_creatives: [{ campaign_id: "c1", status: "ready", creative_mode: "card", alt_text: null }],
    };
    const sb = fakeSb(tables);
    const r = await updatePlatformPopupAdminCampaign(sb as never, {
      campaignId: "c1",
      adminUserId: "a",
      patch: { altText: "  봄 할인 안내 " },
    });
    expect(r.ok).toBe(true);
    expect(tables.platform_popup_creatives[0]!.alt_text).toBe("봄 할인 안내");
  });

  it("P-6: 잘못된 시간대는 400 timezone_invalid + 한국어 문구", async () => {
    expect(isValidIanaTimezone("Asia/Manila")).toBe(true);
    expect(isValidIanaTimezone("Mars/Base")).toBe(false);
    const sb = fakeSb({ platform_popup_campaigns: [liveCampaign()] });
    const r = await updatePlatformPopupAdminCampaign(sb as never, {
      campaignId: "c1",
      adminUserId: "a",
      patch: { timezone: "Mars/Base" },
    });
    expect(r).toMatchObject({ ok: false, error: "timezone_invalid", httpStatus: 400 });
    const msg = formatPlatformPopupAdminError("timezone_invalid", "ko");
    expect(msg).toContain("시간대");
    expect(msg).not.toContain("timezone_invalid");
  });
});

describe("P-3 PTR 낭독 문구 = title 우선 → 띠 대체 텍스트", () => {
  it("공용 함수", () => {
    expect(ptrRevealAccessibleText("봄 세일", "띠 설명")).toBe("봄 세일");
    expect(ptrRevealAccessibleText("  ", "띠 설명")).toBe("띠 설명");
  });
  it("앱 페이로드도 title 우선", () => {
    const ad = buildPtrRevealAdPayload(
      cand({
        id: "p1",
        title: "봄 세일",
        presentationType: "ptr_reveal",
        ptrBands: {
          default: { id: "b1", aspectW: 4, aspectH: 1, assetUrl: "https://img.example.com/b.webp", assetPath: null, altText: "띠 설명" },
        },
      }),
      { href: "/market", surface: "TRADE" }
    );
    expect(ad?.bands.default.altText).toBe("봄 세일");
  });
});

describe("P-4 노출 위치 경로 예시 = 실제 판정", () => {
  const byMode = Object.fromEntries(PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.map((o) => [o.mode, o.pagesKo]));
  it("홈에 / · /home (실제 HOME, 2026-11-09) · 커뮤니티는 /philife", () => {
    expect(byMode.HOME).toContain("/home");
    expect(byMode.COMMUNITY).toContain("/philife");
    expect(resolveDibaySurface("/home")).toBe("HOME");
    expect(resolveDibaySurface("/")).toBe("HOME");
  });
  it("거래 /write 는 제외로 표시 (실제 ORDER_CRITICAL)", () => {
    expect(byMode.TRADE).toContain("/write 제외");
    expect(resolveDibaySurface("/write")).not.toBe("TRADE");
  });
  it("내정보 제외 경로 표시 (거래 채팅·매장 주문)", () => {
    expect(byMode.MYPAGE).toContain("제외");
    expect(resolveDibaySurface("/mypage/trade/chat/1")).not.toBe("MYPAGE");
    expect(resolveDibaySurface("/mypage/store-orders/1")).not.toBe("MYPAGE");
  });
});

describe("CX-03 콘텐츠 방문 출처", () => {
  it("PTR·INTRO 허용", () => {
    expect(isPromotionCoordinationChannel("PTR")).toBe(true);
    expect(isPromotionCoordinationChannel("INTRO")).toBe(true);
    expect(isPromotionCoordinationChannel("DIRECT")).toBe(false);
  });
});

function ptrAd(id: string, frequencyMode: PtrRevealAd["frequencyMode"] = "close_only"): PtrRevealAd {
  return {
    campaignId: id,
    surface: "TRADE",
    href: "/market",
    ctaLabel: null,
    title: null,
    frequencyMode,
    suppressionDurationSeconds: null,
    timezone: "Asia/Manila",
    bands: { default: { creativeId: `b-${id}`, imageUrl: "https://img.example.com/b.webp", altText: "a" }, tablet: null, logo: null },
  };
}

describe("CX-06 PTR 캐시·close_only 보류 — 계정 바뀜·로그아웃 때 초기화", () => {
  beforeEach(() => __resetPtrRevealAdsForTests());
  afterEach(() => __resetPtrRevealAdsForTests());

  it("로그아웃(회원 → 비회원)하면 이전 계정의 close_only 보류·캐시를 비운다", () => {
    expect(notePtrRevealIdentity({ authReady: true, userId: "u1", deviceKey: "d" })).toBe(false);
    __setPtrRevealAdForTests("TRADE", ptrAd("c1"));
    finishPtrRevealExposure("/market", ptrAd("c1"));
    expect(listPtrRevealHeldCampaignIds("TRADE")).toEqual(["c1"]);
    expect(notePtrRevealIdentity({ authReady: true, userId: null, deviceKey: "d" })).toBe(true);
    expect(listPtrRevealHeldCampaignIds("TRADE")).toEqual([]);
    __setPtrRevealAdForTests("TRADE", ptrAd("c1"));
    expect(readPtrRevealAd("/market", "default")?.campaignId).toBe("c1");
  });

  it("로그인 확인 중(authReady=false)은 초기화하지 않는다", () => {
    notePtrRevealIdentity({ authReady: true, userId: "u1", deviceKey: "d" });
    __setPtrRevealAdForTests("TRADE", ptrAd("c1"));
    expect(notePtrRevealIdentity({ authReady: false, userId: null, deviceKey: "d" })).toBe(false);
    expect(readPtrRevealAd("/market", "default")?.campaignId).toBe("c1");
  });
});
