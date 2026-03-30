import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";

export function getStoreBusinessBlockedTitleBody(state: OwnerStoreGateState): { title: string; body: string } {
  if (state.kind === "empty") {
    return {
      title: "매장이 없습니다",
      body: "먼저 매장 등록 신청을 해 주세요. 심사가 완료되면 여기서 주문·상품·정산을 관리할 수 있습니다.",
    };
  }
  if (state.kind === "pending") {
    const st = state.approval_status;
    if (st === "rejected") {
      return {
        title: "신청이 반려되었습니다",
        body: state.rejected_reason?.trim()
          ? state.rejected_reason
          : "자세한 사유는 운영 정책에 따라 별도 안내될 수 있습니다.",
      };
    }
    if (st === "revision_requested") {
      return {
        title: "보완이 필요합니다",
        body: state.revision_note?.trim()
          ? state.revision_note
          : "안내에 따라 정보를 수정한 뒤 다시 제출해 주세요.",
      };
    }
    return {
      title: "심사 중입니다",
      body: "승인이 완료되면 매장 관리 화면이 열립니다. 잠시만 기다려 주세요.",
    };
  }
  return {
    title: "매장 관리",
    body: "승인된 매장만 매장 어드민을 이용할 수 있습니다.",
  };
}

export function showStoreBusinessProfilePreviewLink(
  state: OwnerStoreGateState,
  firstStoreId: string | undefined
): boolean {
  return !!(
    firstStoreId &&
    state.kind === "pending" &&
    state.approval_status !== "rejected" &&
    state.approval_status !== "suspended"
  );
}

export function showStoreBusinessApplyLink(state: OwnerStoreGateState): boolean {
  return (
    state.kind === "empty" ||
    (state.kind === "pending" && state.approval_status === "rejected")
  );
}
