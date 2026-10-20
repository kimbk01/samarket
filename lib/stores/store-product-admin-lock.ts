/**
 * 1-J 상품 판매 상태 규칙 — 관리자 잠금(ND-1) · 품절 사유(PRD-06) · 검수 판매 게이트(PRD-03).
 *
 * - 관리자 숨김·품절·차단 → `store_products.admin_status_lock` 설정, 관리자 「판매 재개(activate)」로만 해제.
 *   잠금 중 오너는 `product_status` 를 바꿀 수 없다 (403 `admin_locked`). 주문 경로는 상태값만 본다.
 * - 품절 사유 `sold_out_reason`: stock(재고 0 자동 — 주문 RPC) · manual(오너) · admin(관리자).
 *   취소 재고 복원(`restore_store_order_stock_atomic`)은 `stock` 일 때만 판매중으로 되돌린다.
 * - 관리자 검수 반려(`rejected`)·재검수 대기(`pending`) 상품은 판매·노출 불가 (메뉴 RPC·체크아웃·주문 RPC 동일).
 *
 * 순수 모듈 — 서버 라우트·테스트에서 공용. 마이그레이션 20270602130000 미적용 DB 에서는
 * 두 컬럼이 없으므로 `isMissingStoreProductLockColumnError` 로 감지해 레거시 select/patch 로 폴백한다.
 */

export const STORE_PRODUCT_ADMIN_LOCKS = ["hidden", "sold_out", "blocked"] as const;
export type StoreProductAdminLock = (typeof STORE_PRODUCT_ADMIN_LOCKS)[number];

export const STORE_PRODUCT_SOLD_OUT_REASONS = ["stock", "manual", "admin"] as const;
export type StoreProductSoldOutReason = (typeof STORE_PRODUCT_SOLD_OUT_REASONS)[number];

/** 마이그레이션 20270602130000 이 추가하는 컬럼 */
export const STORE_PRODUCT_LOCK_COLUMNS = ["admin_status_lock", "sold_out_reason"] as const;

/** 반려·재검수 대기 = 판매/노출 불가 (신규 상품 기본값 `none`, 관리자 승인 `approved` 는 판매 가능) */
export const STORE_PRODUCT_REVIEW_UNSELLABLE = ["rejected", "pending"] as const;

export function isStoreProductReviewUnsellable(adminReviewStatus: unknown): boolean {
  const s = String(adminReviewStatus ?? "").trim();
  return (STORE_PRODUCT_REVIEW_UNSELLABLE as readonly string[]).includes(s);
}

export function parseStoreProductAdminLock(raw: unknown): StoreProductAdminLock | null {
  const s = String(raw ?? "").trim();
  return (STORE_PRODUCT_ADMIN_LOCKS as readonly string[]).includes(s) ? (s as StoreProductAdminLock) : null;
}

/** PostgREST 오류가 1-J 컬럼 미적용(마이그레이션 전) 때문인지 */
export function isMissingStoreProductLockColumnError(err: { message?: unknown } | null | undefined): boolean {
  const msg = String(err?.message ?? "");
  if (!msg) return false;
  if (!STORE_PRODUCT_LOCK_COLUMNS.some((c) => msg.includes(c))) return false;
  return /column|does not exist|schema cache|could not find/i.test(msg);
}

/** 1-J 컬럼이 없는 DB 에 보낼 patch — 잠금·사유 키 제거 */
export function stripStoreProductLockColumns<T extends Record<string, unknown>>(patch: T): T {
  const out = { ...patch };
  for (const c of STORE_PRODUCT_LOCK_COLUMNS) delete (out as Record<string, unknown>)[c];
  return out;
}

export type OwnerProductStatusPrev = {
  product_status?: unknown;
  admin_review_status?: unknown;
  admin_status_lock?: unknown;
};

export type OwnerProductStatusBlock = {
  status: 403;
  error: "admin_locked" | "admin_blocked_product" | "admin_review_rejected" | "admin_review_pending";
  message: string;
};

const ADMIN_LOCK_LABEL_KO: Record<StoreProductAdminLock, string> = {
  hidden: "숨김",
  sold_out: "품절",
  blocked: "판매 차단",
};

/** 오너 허브·폼 표시용 — 관리자 잠금 사유 문구 */
export function ownerAdminLockLabelKo(lock: StoreProductAdminLock): string {
  return `관리자 ${ADMIN_LOCK_LABEL_KO[lock]} 조치`;
}

/**
 * 오너 상태 변경 게이트 (PATCH `product_status`). 같은 상태로의 요청은 변경이 아니므로 통과(no-op).
 * 순서: 관리자 잠금 → 레거시 차단 상태 → 검수 반려/재검수 대기(판매 전환만 차단).
 */
export function ownerProductStatusChangeBlock(
  prev: OwnerProductStatusPrev,
  next: string
): OwnerProductStatusBlock | null {
  const cur = String(prev.product_status ?? "").trim();
  if (next === cur) return null;
  const lock = parseStoreProductAdminLock(prev.admin_status_lock);
  if (lock) {
    return {
      status: 403,
      error: "admin_locked",
      message: `${ownerAdminLockLabelKo(lock)} 상품입니다. 관리자가 해제해야 판매 상태를 바꿀 수 있습니다.`,
    };
  }
  if (cur === "blocked") {
    return {
      status: 403,
      error: "admin_blocked_product",
      message: "관리자가 판매를 차단한 상품입니다. 고객센터로 문의해 주세요.",
    };
  }
  const review = String(prev.admin_review_status ?? "").trim();
  if (next === "active" || next === "sold_out") {
    if (review === "rejected") {
      return {
        status: 403,
        error: "admin_review_rejected",
        message: "관리자 검수에서 반려된 상품입니다. 내용을 수정하면 재검수 요청이 되고, 승인 후 판매할 수 있습니다.",
      };
    }
    if (review === "pending") {
      return {
        status: 403,
        error: "admin_review_pending",
        message: "재검수 대기 중인 상품입니다. 관리자 검수 승인 후 판매할 수 있습니다.",
      };
    }
  }
  return null;
}

/** 오너가 상태를 바꿀 때 함께 쓰는 품절 사유: sold_out → manual, 그 외 → NULL */
export function ownerSoldOutReasonForStatus(next: string): StoreProductSoldOutReason | null {
  return next === "sold_out" ? "manual" : null;
}

/** 오너 허브: 상태 토글을 막아야 하는 이유 (잠금 > 차단 > 검수) — 없으면 null */
export function ownerProductToggleLockReason(p: OwnerProductStatusPrev): {
  kind: "admin_locked" | "blocked" | "review_rejected" | "review_pending";
  lock: StoreProductAdminLock | null;
} | null {
  const lock = parseStoreProductAdminLock(p.admin_status_lock);
  if (lock) return { kind: "admin_locked", lock };
  if (String(p.product_status ?? "") === "blocked") return { kind: "blocked", lock: null };
  const review = String(p.admin_review_status ?? "").trim();
  if (review === "rejected") return { kind: "review_rejected", lock: null };
  if (review === "pending") return { kind: "review_pending", lock: null };
  return null;
}
