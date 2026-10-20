import { describe, expect, it } from "vitest";
import {
  buildAddressDetailSaveBody,
  isAddressDetailDirty,
  resolveAddressMasterToggleInitial,
} from "@/lib/addresses/address-detail-save-body";
import { resolveAddressSearchResultState } from "@/lib/addresses/address-search-result-state";
import { classifyPlacePredictionsStatus } from "@/lib/map/fetch-place-predictions-ph";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

const fields = { detailAddress: "Unit 3", nickname: "loc:x" };

describe("S07 주소 편집 — 대표 주소 임의 변경 금지", () => {
  it("수정 저장(토글 미변경) → 본문에 isDefaultMaster 없음", () => {
    const body = buildAddressDetailSaveBody({
      isShop: false,
      label: "home",
      masterOn: false,
      initialIsMaster: false,
      mode: "edit",
      fields: { ...fields, isDefaultMaster: true },
    });
    expect("isDefaultMaster" in body).toBe(false);
    expect(body.labelType).toBe("home");
  });

  it("이미 대표인 주소 수정 → 생략(서버 기존 값 유지)", () => {
    const body = buildAddressDetailSaveBody({
      isShop: false,
      label: "other",
      masterOn: true,
      initialIsMaster: true,
      mode: "edit",
      fields,
    });
    expect("isDefaultMaster" in body).toBe(false);
  });

  it("사용자가 토글을 켰을 때만 true", () => {
    const body = buildAddressDetailSaveBody({
      isShop: false,
      label: "office",
      masterOn: true,
      initialIsMaster: false,
      mode: "edit",
      fields,
    });
    expect(body.isDefaultMaster).toBe(true);
    const created = buildAddressDetailSaveBody({
      isShop: false,
      label: "other",
      masterOn: true,
      initialIsMaster: false,
      mode: "create",
      fields,
    });
    expect(created.isDefaultMaster).toBe(true);
  });

  it("첫 주소(잠금 ON) → 생략(서버 자동 대표)", () => {
    const body = buildAddressDetailSaveBody({
      isShop: false,
      label: "other",
      masterOn: true,
      initialIsMaster: false,
      mode: "create",
      masterLocked: true,
      fields,
    });
    expect("isDefaultMaster" in body).toBe(false);
  });

  it("매장 행 → shop 라벨 유지, isDefaultMaster 절대 전송 안 함(false 도 금지)", () => {
    const body = buildAddressDetailSaveBody({
      isShop: true,
      label: "home",
      masterOn: true,
      initialIsMaster: false,
      mode: "edit",
      fields: { ...fields, isDefaultMaster: false },
    });
    expect(body.labelType).toBe("shop");
    expect("isDefaultMaster" in body).toBe(false);
  });

  it("토글 초기값 — 첫 주소 ON·잠금 / 두 번째 OFF / 대표 지정 컨텍스트 ON / 대표 수정 잠금", () => {
    const base = { mode: "create" as const, initialIsMaster: false, isShop: false, callerPrefersMaster: false };
    expect(resolveAddressMasterToggleInitial({ ...base, activeAddressCount: 0 })).toEqual({
      on: true,
      locked: true,
      reason: "first",
    });
    expect(resolveAddressMasterToggleInitial({ ...base, activeAddressCount: 2 })).toEqual({
      on: false,
      locked: false,
      reason: null,
    });
    expect(
      resolveAddressMasterToggleInitial({ ...base, activeAddressCount: 2, callerPrefersMaster: true }).on,
    ).toBe(true);
    expect(
      resolveAddressMasterToggleInitial({ ...base, mode: "edit", initialIsMaster: true, activeAddressCount: 2 }),
    ).toEqual({ on: true, locked: true, reason: "current" });
  });

  it("변경 감지 — 같은 값이면 false, 라벨·상세·대표 변경이면 true", () => {
    const initial = {
      id: "a1",
      labelType: "home",
      detailAddress: "Unit 3",
      unitFloorRoom: null,
      landmark: "",
      deliveryNote: null,
      isDefaultMaster: false,
      latitude: 14.5,
      longitude: 121,
    } as unknown as UserAddressDTO;
    const draft = { latitude: 14.5, longitude: 121 } as never;
    const same = { mode: "edit" as const, initial, detail: "Unit 3", landmark: "", deliveryNote: "", label: "home" as const, masterOn: false, draft };
    expect(isAddressDetailDirty(same)).toBe(false);
    expect(isAddressDetailDirty({ ...same, label: "office" })).toBe(true);
    expect(isAddressDetailDirty({ ...same, detail: "Unit 4" })).toBe(true);
    expect(isAddressDetailDirty({ ...same, masterOn: true })).toBe(true);
  });
});

describe("S08 주소 검색 — 0건과 오류 구분", () => {
  const statuses = { OK: "OK", ZERO_RESULTS: "ZERO_RESULTS" };
  it("ZERO_RESULTS → 빈, REQUEST_DENIED·UNKNOWN → 오류", () => {
    expect(classifyPlacePredictionsStatus("OK", statuses)).toBe("ok");
    expect(classifyPlacePredictionsStatus("ZERO_RESULTS", statuses)).toBe("zero");
    expect(classifyPlacePredictionsStatus("REQUEST_DENIED", statuses)).toBe("error");
    expect(classifyPlacePredictionsStatus("UNKNOWN_ERROR", statuses)).toBe("error");
  });

  it("결과 영역 상태", () => {
    expect(resolveAddressSearchResultState({ query: "a", searching: false, failed: false, count: 0 })).toBe("idle");
    expect(resolveAddressSearchResultState({ query: "abc", searching: true, failed: false, count: 0 })).toBe("searching");
    expect(resolveAddressSearchResultState({ query: "abc", searching: false, failed: true, count: 0 })).toBe("error");
    expect(resolveAddressSearchResultState({ query: "abc", searching: false, failed: false, count: 0 })).toBe("empty");
    expect(resolveAddressSearchResultState({ query: "abc", searching: false, failed: false, count: 2 })).toBe("results");
  });
});
