import type { MessageKey } from "@/lib/i18n/messages";

export type OwnerHeaderStatusChip = {
  labelKey: MessageKey;
  tone: "success" | "muted" | "warning";
};

/**
 * 사장님 헤더 매장 상태 칩 1개 — 고객에게 실제로 보이는 상태 순서로 판정 (Owner 재설계안 승인 2026-11-03).
 * 이전: `is_open` 만 보고 「영업중」 → 심사 중·숨김 매장도 「영업중」으로 보였음.
 * 우선순위: 승인 전 「심사·준비」 → 노출 꺼짐 「비공개」 → 좌표 없음 「위치 필요」 → 업종 없음 「업종 필요」 → 영업 「영업중」/「일시중지」.
 * 문구 키는 메뉴(드로어) 머리 칩과 같은 키.
 */
export function resolveOwnerHeaderStatusChip(input: {
  approvalStatus: string | null | undefined;
  isVisible: boolean | null | undefined;
  isOpen: boolean;
  /** 공개여도 손님 배달 목록에 안 나오는 이유 — 좌표 없음(실기 2026-11-03 D1)·업종 없음(2회차 P3) */
  listingBlocker?: "location" | "category" | null;
}): OwnerHeaderStatusChip {
  if (String(input.approvalStatus ?? "") !== "approved") {
    return { labelKey: "business_phase7_183", tone: "warning" };
  }
  if (input.isVisible !== true) {
    return { labelKey: "business_phase7_132", tone: "muted" };
  }
  if (input.listingBlocker === "location") {
    return { labelKey: "owner_header_chip_location_required", tone: "warning" };
  }
  if (input.listingBlocker === "category") {
    return { labelKey: "owner_header_chip_category_required", tone: "warning" };
  }
  return input.isOpen
    ? { labelKey: "store_owner_ops_open", tone: "success" }
    : { labelKey: "store_owner_ops_paused", tone: "muted" };
}
