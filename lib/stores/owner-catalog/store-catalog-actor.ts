/**
 * 3-C §9-3 — 매장 카탈로그(소개·상품·메뉴 섹션·이미지 업로드) 저장 코어의 실행 주체.
 * - `owner`: 오너 라우트(`/api/me/stores/[storeId]/**`) — 기존 소유·운영 게이트 통과 후 호출. 동작·응답 불변.
 * - `admin_sample`: 관리자 라우트(`/api/admin/stores/[id]/sample-catalog/**`) — `requireAdminPermission("business")` +
 *   서버에서 `store_kind='sample'` 재검증 후 호출. 샘플은 판매 권한이 영구히 없으므로(DB 트리거) 상품 「판매중」
 *   전환의 판매 승인 게이트만 적용하지 않는다 (공개 메뉴 노출은 DB `store_public_menu_open` 이 따로 판정).
 */
export type StoreCatalogActor = {
  kind: "owner" | "admin_sample";
  userId: string;
};

export function ownerCatalogActor(userId: string): StoreCatalogActor {
  return { kind: "owner", userId };
}

export function adminSampleCatalogActor(userId: string): StoreCatalogActor {
  return { kind: "admin_sample", userId };
}

/** 상품 `active` 전환 시 판매 승인 확인이 필요한가 (오너 = 항상, 관리자 샘플 = 아니오). */
export function catalogActorRequiresSalesApproval(actor: StoreCatalogActor): boolean {
  return actor.kind === "owner";
}
