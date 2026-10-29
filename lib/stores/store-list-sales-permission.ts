/**
 * DEF-70 — 고객 매장 목록(HOME 피드·BROWSE)의 판매 권한 반영.
 *
 * 판매 권한 SSOT 는 `store_sales_permissions` (PK·FK = store_id). 결제 RPC
 * (`create_store_order_atomic` → `store_not_selling`)·상세 summary(`canSell`)와 **동일 판정**:
 * 행이 있고 `allowed_to_sell = true` 이고 `sales_status = 'approved'` 일 때만 판매 가능.
 *
 * 목록 쿼리는 이미 `stores` 를 읽는 **같은 PostgREST select** 에 LEFT embed 로 붙인다
 * (store_id PK 조회, 추가 왕복 0, `!inner` 금지 — 행을 제외하지 않고 상태만 바꾼다).
 */
import { isSampleStoreKind } from "@/lib/stores/store-public-menu-open";

export const STORE_LIST_SALES_PERMISSION_EMBED = "store_sales_permissions ( allowed_to_sell, sales_status )";

type SalesPermissionEmbedRow = { allowed_to_sell?: unknown; sales_status?: unknown };

/** embed 결과(객체·배열·null) → 판매 가능 여부. 행 없음 = 판매 불가 (결제 RPC 와 동일). */
export function resolveStoreListSalesAllowedFromEmbed(embed: unknown): boolean {
  const row = (Array.isArray(embed) ? embed[0] : embed) as SalesPermissionEmbedRow | null | undefined;
  if (!row || typeof row !== "object") return false;
  return row.allowed_to_sell === true && String(row.sales_status ?? "") === "approved";
}

/**
 * 목록 행에서 embed 를 떼고 `sales_allowed` 로 평탄화.
 * embed 키가 없으면(이미 평탄화된 행·스냅샷 행) 기존 `sales_allowed` 를 유지한다 — 재매핑 안전.
 *
 * 묶음3-A S-02·S-03 — 같은 select 에 `store_kind` 가 있으면 `is_sample_store` boolean 으로 바꾸고
 * 원문 `store_kind` 는 행에서 제거한다(공개 응답에 내부 분류 문자열을 싣지 않음).
 */
export function flattenStoreListSalesPermission<T extends Record<string, unknown>>(
  row: T
): Omit<T, "store_sales_permissions"> & { sales_allowed?: boolean | null; is_sample_store?: boolean } {
  type Out = Omit<T, "store_sales_permissions"> & {
    sales_allowed?: boolean | null;
    is_sample_store?: boolean;
  };
  let out: Record<string, unknown> = row;
  if ("store_sales_permissions" in row) {
    const { store_sales_permissions: embed, ...rest } = row;
    out = { ...rest, sales_allowed: resolveStoreListSalesAllowedFromEmbed(embed) };
  }
  if ("store_kind" in out) {
    const { store_kind: kind, ...rest } = out;
    out = { ...rest, is_sample_store: isSampleStoreKind(kind) };
  }
  return out as Out;
}
