/**
 * 주소 입력 시안 구현 (Owner 2026-11-09 「시안대로 구현」) — 일반/배달 구분 · 지도 확인 단계 · 결함 A1~A6.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildDeliveryAddressesHrefFromPath,
  buildMypageAddressEditHref,
  buildMypageAddressMapHref,
  buildMypageAddressSearchHref,
  buildMypageAddressesHref,
  isMypageAddressFlowPath,
  parseAddressFlowPurpose,
} from "@/lib/addresses/mypage-addresses-return-to";
import { resolveAddressMasterToggleInitial } from "@/lib/addresses/address-detail-save-body";
import { tapHaptic } from "@/lib/ui/tap-haptic";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("일반 / 배달 진입 구분 (purpose)", () => {
  it("배달 진입만 purpose=delivery, 흐름 내내 유지", () => {
    expect(buildDeliveryAddressesHrefFromPath("/stores/abc/cart")).toBe(
      "/mypage/addresses?returnTo=%2Fstores%2Fabc%2Fcart&purpose=delivery",
    );
    expect(buildMypageAddressesHref("/home")).toBe("/mypage/addresses?returnTo=%2Fhome");
    expect(buildMypageAddressSearchHref({ purpose: "delivery" })).toBe("/mypage/addresses/search?purpose=delivery");
    expect(buildMypageAddressMapHref({ returnTo: "/x", purpose: "delivery" })).toBe(
      "/mypage/addresses/map?returnTo=%2Fx&purpose=delivery",
    );
    expect(buildMypageAddressEditHref({ id: "a1", purpose: "general" })).toBe("/mypage/addresses/edit?id=a1");
    expect(parseAddressFlowPurpose("delivery")).toBe("delivery");
    expect(parseAddressFlowPurpose("x")).toBe("general");
    expect(isMypageAddressFlowPath("/mypage/addresses/map")).toBe(true);
  });

  it("A1 — 검색 제목: 일반은 「주소를 검색해 주세요」, 배달만 「배달 받을 주소…」", () => {
    const src = read("components/addresses/AddressPlatformSearchClient.tsx");
    expect(src).toContain('purpose === "delivery" ? t("addr_v2_search_lead") : t("addr_v3_search_lead_general")');
  });

  it("배달 화면 링크 13곳은 배달 흐름으로", () => {
    for (const f of [
      "components/stores/StoreCommerceCartPageClient.tsx",
      "components/stores/StoreDetailPublic.tsx",
      "components/stores/home/hub/StoresHomeHeaderChrome.tsx",
      "components/stores/browse/StoresBrowseHeaderChrome.tsx",
      "components/stores/StoreDetailBottomStrip.tsx",
      "components/delivery/viewer-gate/DeliveryViewerGatePanel.tsx",
      "components/addresses/DeliveryRoutableAddressGate.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toContain("buildDeliveryAddressesHrefFromPath");
      expect(src, f).not.toContain("buildMypageAddressesHrefFromPath");
    }
    expect(read("components/home-hub/HomeStoresSection.tsx")).toContain('{ purpose: "delivery" }');
  });
});

describe("A4 — 대표 토글은 주소 목록을 받은 뒤 판정", () => {
  it("목록 전(0개로 계산)이면 첫 주소로 잠기던 결함 — listReady 전에는 1개 이상으로 본다", () => {
    const src = read("components/addresses/AddressPlatformDetailClient.tsx");
    expect(src).toContain("activeAddressCount: listReady ? allAddresses.length : 1");
    expect(src).toContain("[mode, initial?.id, listReady, allAddresses.length]");
    expect(read("components/addresses/AddressEditorPageClient.tsx")).toContain("setListReady(true)");
    expect(
      resolveAddressMasterToggleInitial({ mode: "create", initialIsMaster: false, isShop: false, activeAddressCount: 1, callerPrefersMaster: false }),
    ).toEqual({ on: false, locked: false, reason: null });
  });
  it("배달 새 주소는 대표로(배달 기준 = 대표 주소)", () => {
    expect(
      resolveAddressMasterToggleInitial({ mode: "create", initialIsMaster: false, isShop: false, activeAddressCount: 2, callerPrefersMaster: true }),
    ).toEqual({ on: true, locked: false, reason: null });
    expect(read("components/addresses/AddressPlatformDetailClient.tsx")).toContain('callerPrefersMaster || (isDelivery && mode === "create")');
  });
});

describe("저장 화면 (4·6번)", () => {
  const src = read("components/addresses/AddressPlatformDetailClient.tsx");
  it("A3 — 상세 주소는 한 줄 입력, Enter = 다음 칸(배달) / 닫기(일반)", () => {
    expect(src).not.toContain("<textarea");
    expect(src).toContain('enterKeyHint={isDelivery ? "next" : "done"}');
    expect(src).toContain("focusNextField");
  });
  it("A5 — 필수 표시 + 오류는 그 칸 아래, 버튼은 비활성으로 두지 않음", () => {
    expect(src).toContain('t("addr_v3_required")');
    expect(src).toContain('id="addr-editor-detail-err"');
    expect(src).not.toContain("Boolean(detail.trim()) && (mode");
  });
  it("A6 — 일반 주소에는 배달 칸(찾아오는 길·요청사항) 없음", () => {
    const general = src.slice(src.indexOf("/** 시안 4번"));
    expect(general).not.toContain("noteRef");
    expect(general).not.toContain("landmarkRef");
    expect(general).toContain('role="radiogroup"');
  });
  it("A2 — 배달 버튼 줄은 공통 키보드 측정으로 키보드 위, 일반 저장은 본문 안", () => {
    const delivery = src.slice(src.indexOf("/** 시안 6번"), src.indexOf("/** 시안 4번"));
    expect(delivery).toContain('data-form-keyboard-footer="1"');
    expect(delivery).toContain("effectiveBottomInset");
  });
});

describe("지도 위치 확인 (3번)", () => {
  it("가운데 고정 핀, 사용자가 옮겼을 때만 주소 갱신", () => {
    const map = read("components/addresses/AddressCenterPinMapClient.tsx");
    expect(map).toContain('addListener("dragstart"');
    expect(map).toContain('addListener("idle"');
    expect(map).toContain('tapHaptic("drop")');
    expect(read("app/(main)/mypage/addresses/map/page.tsx")).toContain("AddressMapConfirmClient");
  });
});

describe("진동", () => {
  it("navigator.vibrate 있으면 호출, 없으면 무시", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    tapHaptic("select");
    tapHaptic("error");
    expect(vibrate).toHaveBeenNthCalledWith(1, 8);
    expect(vibrate).toHaveBeenNthCalledWith(2, [12, 40, 12]);
    vi.stubGlobal("navigator", {});
    expect(() => tapHaptic("success")).not.toThrow();
    vi.unstubAllGlobals();
  });
});
