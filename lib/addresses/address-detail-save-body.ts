/**
 * 주소 편집 저장 본문 (최종 설계 S07) — 순수 함수(화면·테스트 공용).
 *
 * CONTRACT
 * - **수정 저장은 대표 주소를 바꾸지 않는다.** 사용자가 대표 토글을 켰을 때만 `isDefaultMaster: true` 를 보내고,
 *   그 외에는 본문에서 `isDefaultMaster` 키 자체를 생략한다(서버는 생략 시 기존 값 유지 — `=== true` 일 때만 대표 변경).
 * - 매장 연결 행은 `isDefaultMaster` 를 절대 보내지 않는다(`false` 도 금지 — 생략).
 * - 첫 주소(추가)는 서버가 자동 대표 지정(`ensureSomeoneDefaultIfFirst`) — 화면은 토글 ON·잠금으로만 표시하고 생략.
 * - 라벨: 선택값(`home|office|other`), 매장 행은 `shop` 유지.
 */
import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

export type AddressEditableLabel = "home" | "office" | "other";

export type AddressMasterToggleInitial = {
  on: boolean;
  locked: boolean;
  /** 잠금 사유 — first = 첫 주소(자동 대표), current = 이미 대표(끄기 불가: 다른 주소를 대표로 지정해야 바뀜) */
  reason: "first" | "current" | null;
};

export function resolveAddressMasterToggleInitial(input: {
  mode: "create" | "edit";
  initialIsMaster: boolean;
  isShop: boolean;
  /** 현재 활성 주소 수(추가 전) */
  activeAddressCount: number;
  /** 대표 지정 목적의 호출 컨텍스트 — 추가 시 기본 ON */
  callerPrefersMaster: boolean;
}): AddressMasterToggleInitial {
  if (input.isShop) return { on: false, locked: true, reason: null };
  if (input.mode === "edit") {
    return input.initialIsMaster
      ? { on: true, locked: true, reason: "current" }
      : { on: false, locked: false, reason: null };
  }
  if (input.activeAddressCount === 0) return { on: true, locked: true, reason: "first" };
  return { on: input.callerPrefersMaster, locked: false, reason: null };
}

export type AddressDetailSaveFields = Record<string, unknown>;

export function buildAddressDetailSaveBody(input: {
  isShop: boolean;
  label: AddressEditableLabel;
  masterOn: boolean;
  initialIsMaster: boolean;
  mode: "create" | "edit";
  /** 생성 직후 후속 보정 실패 → 같은 행 재저장 */
  createdNow?: boolean;
  /** 첫 주소 등 화면이 잠근 ON (서버 자동 대표) — 생략 */
  masterLocked?: boolean;
  fields: AddressDetailSaveFields;
}): AddressDetailSaveFields {
  const body: AddressDetailSaveFields = {
    ...input.fields,
    labelType: input.isShop ? "shop" : input.label,
  };
  delete body.isDefaultMaster;
  const userTurnedOn =
    !input.isShop && input.masterOn && !input.initialIsMaster && input.masterLocked !== true;
  if (userTurnedOn) body.isDefaultMaster = true;
  return body;
}

function sameCoord(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  return Math.abs(Number(a) - Number(b)) < 1e-7;
}

/** 저장 버튼 활성(수정 모드)·미저장 확인 판단 */
export function isAddressDetailDirty(input: {
  mode: "create" | "edit";
  initial: UserAddressDTO | null;
  detail: string;
  landmark: string;
  deliveryNote: string;
  label: AddressEditableLabel;
  masterOn: boolean;
  draft: CanonicalAddressDraft | null;
}): boolean {
  if (input.mode === "create" || !input.initial) {
    return Boolean(input.detail.trim() || input.landmark.trim() || input.deliveryNote.trim());
  }
  const init = input.initial;
  const initDetail = (init.detailAddress ?? init.unitFloorRoom ?? "").trim();
  if (initDetail !== input.detail.trim()) return true;
  if ((init.landmark ?? "").trim() !== input.landmark.trim()) return true;
  if ((init.deliveryNote ?? "").trim() !== input.deliveryNote.trim()) return true;
  if (init.labelType !== "shop" && init.labelType !== input.label) return true;
  if ((init.isDefaultMaster === true) !== input.masterOn) return true;
  if (input.draft) {
    if (!sameCoord(init.latitude, input.draft.latitude) || !sameCoord(init.longitude, input.draft.longitude)) {
      return true;
    }
  }
  return false;
}
