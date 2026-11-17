/**
 * @vitest-environment node
 * 앱 진입 빌드 전 최종 감사 (2026-11-17) PR-3 팝업 항목 — P1~P6 · A1 · A4 · A6 · A8.
 * 설계: docs/audit/app-entry-final-prebuild-audit-2026-11-17.md §2-4 · §2-5 · §5 PR-3
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 가짜 DB */
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  evaluatePlatformPopupCandidateGates,
  resolvePopupAd,
  type PlatformPopupCandidate,
} from "@/lib/platform-popup/resolve-popup-ad";
import { platformPopupSurfacesForPresentation } from "@/lib/platform-popup/admin-surface-target-mode";
import {
  loadPlatformPopupCandidates,
  selectPlatformPopupLastImpressionCandidateIds,
} from "@/lib/platform-popup/load-popup-candidates";
import {
  isPlatformPopupLandscapeBlocked,
  resolvePopupRuntimeBlockReason,
  type PopupRuntimeContext,
} from "@/lib/platform-popup/popup-runtime-context";
import { platformPopupCouponDaysLeft } from "@/lib/platform-popup/coupon-days-left";
import { loadPlatformPopupRecent30d } from "@/lib/platform-popup/admin-campaign-loader";
import {
  processPlatformPopupCreativeToCanonical,
  readPlatformPopupCreativeOrientedSize,
} from "@/lib/platform-popup/creative-pipeline";

const NOW = new Date("2026-11-17T04:00:00.000Z");
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const ART = { id: "a", status: "ready" as const, aspectW: 1080, aspectH: 480, creativeMode: "artwork", assetUrl: "https://cdn.test/a.webp" };

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
    creative: { id: "cr1", status: "ready", aspectW: 36, aspectH: 25, creativeMode: "card", assetUrl: "https://cdn.test/a.webp" },
    ctaType: "internal_page",
    ctaTarget: "/market",
    ctaLookup: { exists: true, visible: true, authorized: true },
    ...overrides,
  };
}

/** 표마다 고정 응답 · 호출 기록 (체인 메서드는 기록만) */
function fakeSb(tables: Record<string, unknown[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  return {
    calls,
    from(table: string) {
      const rec = { table, ops: [] as [string, unknown[]][] };
      calls.push(rec);
      const chain: any = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (res: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(res);
            }
            if (prop === "maybeSingle") return () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null });
            return (...args: unknown[]) => {
              rec.ops.push([String(prop), args]);
              return chain;
            };
          },
        }
      );
      return chain;
    },
  };
}

describe("P3 / RA-5 / A1 — 말풍선은 홈에서만 · 알림 자리는 회원만", () => {
  const tooltip = (o: Partial<PlatformPopupCandidate> = {}) => cand({ presentationType: "tooltip", creative: ART, ...o });
  const gate = (c: PlatformPopupCandidate, surface: "HOME" | "TRADE" | null, viewerUserId: string | null | undefined = undefined) =>
    evaluatePlatformPopupCandidateGates(c, {
      now: NOW,
      scope: "interruptive",
      resolvedSurface: surface,
      viewer: viewerUserId === undefined ? null : { viewerUserId, coordinatedEventIds: null, sessionKey: "s1" },
    });

  it("홈이 아닌 화면 = 후보 아님 (GLOBAL 이어도)", () => {
    expect(gate(tooltip(), "TRADE", null)).toEqual({ ok: false, reason: "tooltip_home_only" });
    expect(gate(tooltip(), "HOME", null).ok).toBe(true);
    // 화면을 막는 팝업은 그대로
    expect(gate(cand(), "TRADE", null).ok).toBe(true);
  });

  it("알림 종 자리 = 회원만 · 지역 자리 = 누구나 · 어드민(보는 사람 없음)은 판정 생략", () => {
    const bell = tooltip({ tooltipAnchor: "notifications" });
    expect(gate(bell, "HOME", null)).toEqual({ ok: false, reason: "tooltip_member_only" });
    expect(gate(bell, "HOME", "u1").ok).toBe(true);
    expect(gate(tooltip({ tooltipAnchor: "region" }), "HOME", null).ok).toBe(true);
    expect(gate(bell, null).ok).toBe(true);
  });

  it("어드민(영역 없음) — 노출 위치에 홈이 없으면 탈락", () => {
    expect(gate(tooltip({ surfaces: ["TRADE"] }), null)).toEqual({ ok: false, reason: "tooltip_home_only" });
    expect(gate(tooltip({ surfaces: ["HOME"] }), null).ok).toBe(true);
  });

  it("앱 조회 — 홈이 아닌 화면에서 말풍선이 1순위를 먹지 않고 다음 팝업이 뽑힌다", () => {
    const r = resolvePopupAd({
      pathname: "/market",
      now: NOW,
      sessionKey: "s1",
      resolvedSurface: "TRADE",
      candidates: [tooltip({ id: "t1", priority: 9 }), cand({ id: "m1", priority: 1 })],
    });
    expect(r.ok && r.winner?.campaignId).toBe("m1");
    // 비회원 홈 + 알림 자리 말풍선 → 다음 순위
    const anon = resolvePopupAd({
      pathname: "/home",
      now: NOW,
      sessionKey: "s1",
      resolvedSurface: "HOME",
      viewerUserId: null,
      candidates: [tooltip({ id: "t1", priority: 9, tooltipAnchor: "notifications" }), cand({ id: "m1", priority: 1 })],
    });
    expect(anon.ok && anon.winner?.campaignId).toBe("m1");
    expect(read("app/api/platform-popup/resolve/route.ts")).toContain("viewerUserId: userId");
  });

  it("저장 — 말풍선이면 노출 위치 = 홈 고정 · 아니면 받은 값", () => {
    expect(platformPopupSurfacesForPresentation("tooltip", ["TRADE", "COMMUNITY"])).toEqual(["HOME"]);
    expect(platformPopupSurfacesForPresentation("tooltip", undefined)).toEqual(["HOME"]);
    expect(platformPopupSurfacesForPresentation("center_modal", ["TRADE"])).toEqual(["TRADE"]);
    expect(platformPopupSurfacesForPresentation("center_modal", undefined)).toBeUndefined();
    const writer = read("lib/platform-popup/admin-campaign-writer.ts");
    expect(writer).toContain("platformPopupSurfacesForPresentation(presentationType");
    expect(writer).toMatch(/requestedSurfaces = platformPopupSurfacesForPresentation\(/);
  });
});

describe("P4 — 마지막 노출은 자격 통과 후보만 읽는다", () => {
  it("탈락(초안·기간 끝·소재 없음·말풍선 홈 없음) 후보는 빼고 통과 후보 id 만", () => {
    const ids = selectPlatformPopupLastImpressionCandidateIds(
      [
        cand({ id: "ok" }),
        cand({ id: "draft", status: "draft", approvalStatus: "not_submitted" }),
        cand({ id: "ended", endAt: "2026-11-10T00:00:00.000Z" }),
        cand({ id: "nocreative", creative: null }),
        cand({ id: "tooltip_trade", presentationType: "tooltip", creative: ART, surfaces: ["TRADE"] }),
      ],
      { now: NOW, scope: "interruptive" }
    );
    expect(ids).toEqual(["ok"]);
  });

  it("후보 3개 중 1개만 자격 통과 → 노출 조회 1번 · 그 캠페인만", async () => {
    const sb = fakeSb({
      platform_popup_campaigns: [
        { id: "c-ok", status: "active", approval_status: "approved", priority: 3, start_at: null, end_at: null, cta_type: "internal_page", cta_target: "/market", presentation_type: "center_modal" },
        { id: "c-nocreative", status: "active", approval_status: "approved", priority: 2, start_at: null, end_at: null, cta_type: "internal_page", cta_target: "/market", presentation_type: "center_modal" },
        { id: "c-future-end", status: "active", approval_status: "approved", priority: 1, start_at: null, end_at: "2020-01-01T00:00:00.000Z", cta_type: "internal_page", cta_target: "/market", presentation_type: "center_modal" },
      ],
      platform_popup_creatives: [
        { id: "cr-ok", campaign_id: "c-ok", status: "ready", aspect_w: 36, aspect_h: 25, asset_path: "a", asset_url: "https://cdn.test/a.webp", alt_text: null, creative_mode: "card" },
        { id: "cr-old", campaign_id: "c-future-end", status: "ready", aspect_w: 36, aspect_h: 25, asset_path: "b", asset_url: "https://cdn.test/b.webp", alt_text: null, creative_mode: "card" },
      ],
      platform_popup_campaign_surfaces: [
        { campaign_id: "c-ok", surface: "GLOBAL" },
        { campaign_id: "c-nocreative", surface: "GLOBAL" },
        { campaign_id: "c-future-end", surface: "GLOBAL" },
      ],
      platform_popup_campaign_events: [{ campaign_id: "c-ok", created_at: "2026-11-16T00:00:00.000Z" }],
    });
    const out = await loadPlatformPopupCandidates(sb as any, { userId: "u1" });
    const eventCalls = sb.calls.filter((c) => c.table === "platform_popup_campaign_events");
    expect(eventCalls).toHaveLength(1);
    expect(eventCalls[0]!.ops).toContainEqual(["eq", ["campaign_id", "c-ok"]]);
    // 호출자에게는 같은 모양(후보 전체) — 통과 후보에만 마지막 노출이 채워진다
    expect(out.map((c) => c.id)).toEqual(["c-ok", "c-nocreative", "c-future-end"]);
    expect(out.find((c) => c.id === "c-ok")!.lastImpressionAt).toBe("2026-11-16T00:00:00.000Z");
    expect(out.find((c) => c.id === "c-nocreative")!.lastImpressionAt).toBeNull();
  });
});

describe("P5 / PO-4 — 가로 허용은 태블릿만 · 정책 응답에 allowLandscape", () => {
  it("짧은 변 600 미만(휴대폰) = 정책과 상관없이 가로 보류 · 600 이상 = 정책", () => {
    expect(isPlatformPopupLandscapeBlocked({ isLandscape: true, allowLandscape: true, viewportShortSide: 390 })).toBe(true);
    expect(isPlatformPopupLandscapeBlocked({ isLandscape: true, allowLandscape: true, viewportShortSide: 800 })).toBe(false);
    expect(isPlatformPopupLandscapeBlocked({ isLandscape: true, allowLandscape: false, viewportShortSide: 800 })).toBe(true);
    expect(isPlatformPopupLandscapeBlocked({ isLandscape: false, allowLandscape: false, viewportShortSide: 390 })).toBe(false);
    // 짧은 변 모름 = 정책만(기본 허용)
    expect(isPlatformPopupLandscapeBlocked({ isLandscape: true, viewportShortSide: null })).toBe(false);
    const ctx = {
      pathname: "/home", surface: "HOME", authReady: true, userId: null, isAppForeground: true,
      isLandscape: true, allowLandscape: true, viewportShortSide: 360,
      incomingCall: false, activeCall: false, nativeCallTransition: false, paymentCritical: false,
      orderSubmitCritical: false, orderConfirmationCritical: false, giftTransferCritical: false,
      authRestoreGate: false, permissionGate: false, addressGate: false, criticalDialog: false,
      startupDeferred: false, storesLcpDeferred: false, launchIntroActive: false, ptrRefreshing: false, appSessionId: "s",
    } as PopupRuntimeContext;
    expect(resolvePopupRuntimeBlockReason(ctx)).toBe("landscape");
    expect(resolvePopupRuntimeBlockReason({ ...ctx, viewportShortSide: 820 })).toBeNull();
  });

  it("서버 꺼짐·가로 금지 응답에 allowLandscape · 앱은 가로 금지면 보류(DEFER)", () => {
    const route = read("app/api/platform-popup/resolve/route.ts");
    const policyBlock = route.slice(route.indexOf('"policy_landscape_off" : "policy_disabled"'), route.indexOf("loadPlatformPopupCandidates(sb"));
    expect(policyBlock).toContain("allowLandscape: policy.allowLandscape");
    const host = read("components/platform-popup/GlobalPopupHost.tsx");
    expect(host).toMatch(/reason === "policy_landscape_off"\) \{\s*setAllowLandscape\(false\);[\s\S]{0,200}type: "DEFER"/);
    expect(host).toContain("viewportShortSide");
  });
});

describe("P6 — 쿠폰 남은 날 = 마닐라 날짜 차이", () => {
  it("2시간 남음 = 오늘(0) · 마닐라 내일 = 1 · 지난 쿠폰 = 0", () => {
    // 11-17 20:00 PHT 기준
    const now = Date.parse("2026-11-17T12:00:00.000Z");
    expect(platformPopupCouponDaysLeft("2026-11-17T14:00:00.000Z", now)).toBe(0); // 22:00 PHT 같은 날
    expect(platformPopupCouponDaysLeft("2026-11-17T16:30:00.000Z", now)).toBe(1); // 00:30 PHT 다음 날
    expect(platformPopupCouponDaysLeft("2026-11-20T03:00:00.000Z", now)).toBe(3);
    expect(platformPopupCouponDaysLeft("2026-11-16T00:00:00.000Z", now)).toBe(0);
    expect(platformPopupCouponDaysLeft(null, now)).toBeNull();
    expect(platformPopupCouponDaysLeft("bad", now)).toBeNull();
  });

  it("남은 시간 1초 타이머는 24시간 안일 때만 · 노출된 첫 칸이 빠지면 화면 잠금", () => {
    const ui = read("components/platform-popup/presentations/EntryPresentations.tsx");
    expect(ui).not.toContain("Math.ceil((t - now) / 86_400_000)");
    expect(ui).toMatch(/untilWindow <= 0\) startTicking\(\)/);
    const host = read("components/platform-popup/GlobalPopupHost.tsx");
    expect(host).toMatch(/if \(midQueue \|\| currentShown\) \{/);
  });
});

describe("P1·P2 — 말풍선 빈도 숨김 · 노출 불가 시 이번 실행 막기", () => {
  it("노출 기록된 말풍선이 화면 이동으로 걷히면 빈도 숨김 행 저장(분석 기록 없음) · 무효로 돌림", () => {
    const host = read("components/platform-popup/GlobalPopupHost.tsx");
    const start = host.indexOf("const shownPathRef");
    const effect = host.slice(start, host.indexOf("const showPresentation", start));
    expect(effect).toMatch(/impressionExposureRef\.current === exposureId[\s\S]{0,120}persistSuppression\(winner, frequencyModeToDismissSuppressMode\(winner\.frequencyMode\)\)/);
    expect(effect).toContain('type: "INVALIDATE"');
    expect(effect).not.toMatch(/void suppress\(/);
  });

  it("보이던 말풍선이 노출 불가로 지워지면 세션 막기", () => {
    const host = read("components/platform-popup/GlobalPopupHost.tsx");
    expect(host).toMatch(
      /hostStateRef\.current === "VISIBLE" && winnerRef\.current\?\.presentationType === "tooltip"\) \{\s*addPlatformPopupSessionBlockedCampaign/
    );
  });
});

describe("A4 — 최근 30일 노출·누름 = 조회 1번", () => {
  it("쪽 안 캠페인 전체를 한 번에 읽어 메모리에서 센다", async () => {
    const sb = fakeSb({
      platform_popup_campaign_events: [
        { campaign_id: "a", event_type: "impression" },
        { campaign_id: "a", event_type: "impression" },
        { campaign_id: "a", event_type: "click" },
        { campaign_id: "b", event_type: "impression" },
      ],
    });
    const out = await loadPlatformPopupRecent30d(sb as any, ["a", "b", "c"], NOW);
    expect(sb.calls).toHaveLength(1);
    const ops = sb.calls[0]!.ops;
    expect(ops).toContainEqual(["select", ["campaign_id, event_type"]]);
    expect(ops).toContainEqual(["in", ["campaign_id", ["a", "b", "c"]]]);
    expect(ops).toContainEqual(["in", ["event_type", ["impression", "click"]]]);
    expect(ops.some(([op]) => op === "gte")).toBe(true);
    expect(ops.some(([op]) => op === "limit")).toBe(true);
    expect(out.get("a")).toEqual({ impressions: 2, clicks: 1 });
    expect(out.get("b")).toEqual({ impressions: 1, clicks: 0 });
    expect(out.get("c")).toEqual({ impressions: 0, clicks: 0 });
  });
});

describe("A6 — 예전 매장 UUID 링크는 앱과 같이 slug 로 확인", () => {
  it("lookup 이 앱과 같은 변환 함수를 쓴다 · 고르기는 비우면 확인 중 해제", () => {
    const lookup = read("lib/platform-popup/admin-destination-lookup.ts");
    expect(lookup).toContain("popupStoreCtaLegacyStoreId(input)");
    expect(lookup).toContain("rewritePopupStoreCtaTargetToSlug(");
    const picker = read("components/admin/platform-popup/AdminPopupDestinationPicker.tsx");
    expect(picker).toMatch(/if \(!hasTarget\) \{[\s\S]{0,200}setLookupBusy\(false\);/);
    expect(picker).toContain('t("admin_popup_v3_dest_lookup_failed")');
  });
});

describe("A8 — EXIF 방향 6 세로 사진 가운데 자르기 · 사장님 경로 화소 상한", () => {
  it("1600×1200 + 방향 6 → 보이는 크기 1200×1600 · 가운데 자르기 성공", async () => {
    const buffer = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#336699" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(buffer).metadata()).orientation).toBe(6);
    const size = await readPlatformPopupCreativeOrientedSize(buffer);
    expect(size).toEqual({ width: 1200, height: 1600 });
    const out = await processPlatformPopupCreativeToCanonical({
      buffer,
      width: size!.width,
      height: size!.height,
      applyCenterCrop: true,
      creativeMode: "card",
    });
    expect(out).toMatchObject({ ok: true, width: 1440, height: 1000, cropped: true });
    // 예전처럼 회전 전 크기를 넘겨도 파이프라인이 보이는 방향으로 다시 잰다
    const legacy = await processPlatformPopupCreativeToCanonical({
      buffer,
      width: 1600,
      height: 1200,
      applyCenterCrop: true,
      creativeMode: "card",
    });
    expect(legacy).toMatchObject({ ok: true, width: 1440, height: 1000 });
  });

  it("사장님·어드민 경로 — 회전 뒤 크기 · 사장님 경로 원본 규격(40MP) 검사", () => {
    const owner = read("app/api/me/platform-popup-requests/[requestId]/creative/route.ts");
    expect(owner).toContain("readPlatformPopupCreativeOrientedSize(buf)");
    expect(owner).toContain('checkPopupCreativeSourceSize({ creativeMode: "card", width, height })');
    expect(owner).not.toContain(".rotate().metadata()");
    const admin = read("app/api/admin/platform-popup-campaigns/[campaignId]/creative/route.ts");
    expect(admin).toContain("readPlatformPopupCreativeOrientedSize(buf)");
    expect(admin).not.toContain(".rotate().metadata()");
  });
});
