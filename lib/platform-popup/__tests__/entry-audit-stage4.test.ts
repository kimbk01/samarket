/**
 * 진입 감사 4단계 (2026-11-17) — 팝업 진입 대기열·새 형태 4종·자동 닫힘·전체 설정·인트로 중 미리 받기.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { platformPopupEntryFieldsPatch } from "@/lib/platform-popup/admin-campaign-writer";
import {
  buildPlatformPopupAdminPatch,
  platformPopupPatchReviewGroups,
  type PlatformPopupAdminForm,
} from "@/lib/platform-popup/popup-admin-patch";
import {
  DEFAULT_PLATFORM_POPUP_ENTRY_POLICY,
  normalizePlatformPopupEntryPolicy,
  validatePlatformPopupEntryPolicy,
} from "@/lib/platform-popup/entry-policy";
import { reducePlatformPopupHostState } from "@/lib/platform-popup/popup-host-machine";
import { comparePopupCandidatesForRotation } from "@/lib/platform-popup/popup-rotation";
import type { PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";
import {
  compositionIsSheet,
  compositionUsesFloatingClose,
  creativeModeForComposition,
  interruptivePresentationForComposition,
  resolvePlatformPopupComposition,
} from "@/lib/platform-popup/resolve-presentation-composition";
import {
  isPlatformPopupAdminSelectablePresentation,
  normalizePlatformPopupAutoDismissSeconds,
  normalizePlatformPopupHexColor,
} from "@/lib/platform-popup/presentation-contract";
import {
  __clearPlatformPopupPrefetchForTests,
  fetchPlatformPopupResolveDeduped,
  platformPopupResolveFlightKey,
  prefetchPlatformPopupResolve,
} from "@/lib/platform-popup/fetch-platform-popup-resolve-client";

const UUID = "11111111-2222-4333-8444-555555555555";

describe("어드민 저장 — 새 칸 검사", () => {
  it("정상 값은 열 이름으로 바꾼다", () => {
    const r = platformPopupEntryFieldsPatch({
      queueClass: "mandatory",
      autoDismissSeconds: 10,
      ctaBgColor: "#0b421a",
      ctaTextColor: "",
      listStoreIds: [UUID, UUID],
      tooltipAnchor: "notifications",
    });
    expect(r).toEqual({
      ok: true,
      patch: {
        queue_class: "mandatory",
        auto_dismiss_seconds: 10,
        cta_bg_color: "#0B421A",
        cta_text_color: null,
        list_store_ids: [UUID],
        tooltip_anchor: "notifications",
      },
    });
  });

  it("모르는 값은 기본값으로 바꾸지 않고 거절한다", () => {
    expect(platformPopupEntryFieldsPatch({ queueClass: "urgent" })).toEqual({ ok: false, error: "queue_class_invalid" });
    expect(platformPopupEntryFieldsPatch({ autoDismissSeconds: 2 })).toEqual({ ok: false, error: "auto_dismiss_invalid" });
    expect(platformPopupEntryFieldsPatch({ autoDismissSeconds: 61 })).toEqual({ ok: false, error: "auto_dismiss_invalid" });
    expect(platformPopupEntryFieldsPatch({ ctaBgColor: "green" })).toEqual({ ok: false, error: "cta_color_invalid" });
    expect(platformPopupEntryFieldsPatch({ listStoreIds: ["verify-x"] })).toEqual({
      ok: false,
      error: "list_store_ids_invalid",
    });
    expect(platformPopupEntryFieldsPatch({ tooltipAnchor: "footer" })).toEqual({ ok: false, error: "tooltip_anchor_invalid" });
  });

  it("자동 닫힘 null = 끄기", () => {
    expect(platformPopupEntryFieldsPatch({ autoDismissSeconds: null })).toEqual({
      ok: true,
      patch: { auto_dismiss_seconds: null },
    });
  });

  it("매장 21개 이상은 거절", () => {
    const ids = Array.from({ length: 21 }, (_, i) => `11111111-2222-4333-8444-${String(i).padStart(12, "0")}`);
    expect(platformPopupEntryFieldsPatch({ listStoreIds: ids })).toEqual({ ok: false, error: "list_store_ids_too_many" });
  });
});

const baseForm: PlatformPopupAdminForm = {
  name: "a",
  priority: 0,
  timezone: "Asia/Manila",
  startAt: null,
  endAt: null,
  surfaces: ["GLOBAL"],
  suppressionMode: "SESSION",
  suppressionDurationSeconds: null,
  presentationType: "list_sheet",
  frequencyMode: "once_per_session",
  creativeMode: "artwork",
  ctaType: "internal_page",
  ctaTarget: "/stores",
  externalUrl: null,
  ctaLabel: null,
  title: null,
  body: null,
  altText: null,
  queueClass: "optional",
  autoDismissSeconds: null,
  ctaBgColor: null,
  ctaTextColor: null,
  listStoreIds: [UUID],
  tooltipAnchor: "region",
};

describe("어드민 PATCH — 바뀐 칸만", () => {
  it("바뀐 것이 없으면 빈 본문", () => {
    expect(buildPlatformPopupAdminPatch(baseForm, { ...baseForm })).toEqual({});
  });

  it("새 형태(list_sheet)를 기준값에 그대로 두면 형태가 바뀐 것으로 잡지 않는다", () => {
    expect(buildPlatformPopupAdminPatch(baseForm, { ...baseForm, name: "b" })).toEqual({ name: "b" });
  });

  it("대기열·자동 닫힘은 운영값 — 노출 중이어도 재검토 묶음 없음", () => {
    const body = buildPlatformPopupAdminPatch(baseForm, { ...baseForm, queueClass: "mandatory", autoDismissSeconds: 10 });
    expect(body).toEqual({ queueClass: "mandatory", autoDismissSeconds: 10 });
    expect(platformPopupPatchReviewGroups(body, { operatorPopup: true }).size).toBe(0);
  });

  it("고객이 보는 내용(매장 목록·버튼 색·말풍선 위치)은 소재 재검토", () => {
    const body = buildPlatformPopupAdminPatch(baseForm, { ...baseForm, listStoreIds: [], ctaBgColor: "#000000" });
    expect(body).toEqual({ listStoreIds: [], ctaBgColor: "#000000" });
    expect([...platformPopupPatchReviewGroups(body, { operatorPopup: true })]).toEqual(["creative"]);
  });
});

describe("팝업 전체 설정", () => {
  it("없거나 깨진 값 = 기본(켜짐 · 2개 · 가로 허용)", () => {
    expect(normalizePlatformPopupEntryPolicy(null)).toEqual(DEFAULT_PLATFORM_POPUP_ENTRY_POLICY);
    expect(normalizePlatformPopupEntryPolicy({ maxPerEntry: 9 }).maxPerEntry).toBe(2);
  });
  it("저장 검사는 범위 밖을 거절", () => {
    expect(validatePlatformPopupEntryPolicy({ enabled: true, maxPerEntry: 4, allowLandscape: true })).toEqual({
      ok: false,
      error: "policy_max_invalid",
    });
    expect(validatePlatformPopupEntryPolicy({ enabled: false, maxPerEntry: 1, allowLandscape: false })).toEqual({
      ok: true,
      policy: { enabled: false, maxPerEntry: 1, allowLandscape: false },
    });
  });
});

describe("호스트 대기열", () => {
  it("닫힘·숨김·보이는 중에서 다음 칸 = 이미지 준비(READY)부터", () => {
    expect(reducePlatformPopupHostState("VISIBLE", { type: "QUEUE_NEXT" })).toBe("READY");
    expect(reducePlatformPopupHostState("DISMISSED", { type: "QUEUE_NEXT" })).toBe("READY");
    expect(reducePlatformPopupHostState("SUPPRESSED", { type: "QUEUE_NEXT" })).toBe("READY");
    expect(reducePlatformPopupHostState("EMPTY", { type: "QUEUE_NEXT" })).toBe("EMPTY");
  });

  it("필수가 선택보다 먼저(덜 본 것·우선순위보다 앞)", () => {
    const cand = (id: string, extra: Partial<PlatformPopupCandidate>) =>
      ({ id, priority: 0, surfaces: ["GLOBAL"], startAt: null, lastImpressionAt: null, ...extra }) as unknown as PlatformPopupCandidate;
    const optionalNew = cand("a", { queueClass: "optional", priority: 99 });
    const mandatorySeen = cand("b", { queueClass: "mandatory", lastImpressionAt: new Date().toISOString() });
    expect([optionalNew, mandatorySeen].sort(comparePopupCandidatesForRotation).map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("새 형태 4종", () => {
  it("형태 → 그리기 · 어드민 선택 가능", () => {
    for (const p of ["coupon_card", "artwork_full", "list_sheet", "tooltip"] as const) {
      const kind = resolvePlatformPopupComposition({ presentationType: p, creativeMode: "card" });
      expect(kind).toBe(p);
      expect(interruptivePresentationForComposition(kind)).toBe(p);
      expect(creativeModeForComposition(kind)).toBe("artwork");
      expect(isPlatformPopupAdminSelectablePresentation(p)).toBe(true);
    }
    expect(compositionIsSheet("list_sheet")).toBe(true);
    expect(compositionUsesFloatingClose("tooltip")).toBe(false);
  });

  it("자동 닫힘·색 정규화", () => {
    expect(normalizePlatformPopupAutoDismissSeconds(10)).toBe(10);
    expect(normalizePlatformPopupAutoDismissSeconds(0)).toBeNull();
    expect(normalizePlatformPopupHexColor("#abcdef")).toBe("#abcdef");
    expect(normalizePlatformPopupHexColor("#abc")).toBeNull();
  });
});

describe("인트로 중 미리 받기", () => {
  afterEach(() => {
    __clearPlatformPopupPrefetchForTests();
    vi.unstubAllGlobals();
  });

  it("같은 조건의 첫 조회는 미리 받은 결과를 쓰고(요청 1회) 소재를 미리 내려받는다", async () => {
    const winner = { campaignId: "c1", creative: { imageUrl: "https://x/a.png" } };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, winner, queue: [winner] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const preload = vi.fn();
    const input = { pathname: "/home", sessionKey: "s", deviceKey: "d" };
    prefetchPlatformPopupResolve({ ...input, preloadImage: preload });
    await new Promise((r) => setTimeout(r, 0));
    const r = await fetchPlatformPopupResolveDeduped({ ...input, generation: "1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.json.queue).toHaveLength(1);
    expect(preload).toHaveBeenCalledWith("https://x/a.png");
    // 두 번째 조회는 새로 받는다(미리 받은 결과는 1회만)
    await fetchPlatformPopupResolveDeduped({ ...input, generation: "2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("가로 화면은 다른 조회 키(landscape=1)", () => {
    const base = { pathname: "/home", sessionKey: "s", deviceKey: "d" };
    expect(platformPopupResolveFlightKey({ ...base, landscape: true })).not.toBe(platformPopupResolveFlightKey(base));
  });
});
