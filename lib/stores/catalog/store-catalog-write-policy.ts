import "server-only";

/**
 * 매장 카탈로그 쓰기 코어 공용 타입 (2026-10-28 배달 감사 §F S-5).
 * 코어는 검증·저장만 하고 HTTP 응답 형태(status + json)를 돌려준다. 게이트·캐시 세대 bump 는 라우트 소유.
 */

export type CatalogOutcome = {
  status: number;
  json: Record<string, unknown>;
  /** 성공이지만 새로 쓴 것이 없음(멱등 재요청) — 라우트는 캐시 무효화·bump 를 하지 않는다 (기존 동작) */
  noWrite?: boolean;
};

export function outcome(status: number, json: Record<string, unknown>): CatalogOutcome {
  return { status, json };
}

/** PRD-15 — 500 응답은 DB 원문을 내보내지 않는다 (서버 로그만). `ownerCatalogDbErrorResponse` 와 같은 본문. */
export function catalogDbErrorOutcome(tag: string, err: unknown): CatalogOutcome {
  console.error(tag, err);
  return { status: 500, json: { ok: false, error: "db_error" } };
}

/**
 * 행위자별 정책. 도메인 규칙(가격·할인·옵션·이미지·섹션·추천 상한·멱등·낙관적 잠금)은 정책과 무관하게 항상 적용.
 * - owner: 기존 오너 규칙 그대로 (판매 승인 필요, 관리자 잠금·검수 상태 게이트, 반려 상품 수정 시 재검수, 품절 사유 manual)
 * - admin_sample: 관리자가 샘플 매장 카탈로그를 직접 운영 (판매 승인·오너 상태 게이트·재검수 없음, 품절 사유 admin)
 */
export type StoreCatalogWritePolicy = {
  actor: "owner" | "admin_sample";
  requireSalesPermissionForActive: boolean;
  applyOwnerStatusChangeGate: boolean;
  reReviewOnRejectedContentEdit: boolean;
  manualSoldOutReason: "manual" | "admin";
};

export const OWNER_CATALOG_WRITE_POLICY: StoreCatalogWritePolicy = {
  actor: "owner",
  requireSalesPermissionForActive: true,
  applyOwnerStatusChangeGate: true,
  reReviewOnRejectedContentEdit: true,
  manualSoldOutReason: "manual",
};

export const ADMIN_SAMPLE_CATALOG_WRITE_POLICY: StoreCatalogWritePolicy = {
  actor: "admin_sample",
  requireSalesPermissionForActive: false,
  applyOwnerStatusChangeGate: false,
  reReviewOnRejectedContentEdit: false,
  manualSoldOutReason: "admin",
};
