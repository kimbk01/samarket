/**
 * 상위노출 가격 원본 읽기 — DB `member_promotion_products` (Owner 2026-11-03 「1번부터 시작」).
 *
 * - 가격·기간·사용 여부는 DB 값만 쓴다. 이름·설명·심사 여부·노출 방식은 코드(`promotion-products.ts`) 값을 붙인다.
 * - DB 표가 아직 없으면(마이그레이션 적용 전) 코드 처음 값으로 동작한다 — `source: "seed"`, `revision: 0`.
 * - 서버 전용 (서비스 키 클라이언트를 받는다).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listMemberPromotionProductSeeds,
  type MemberPromotionDomain,
  type MemberPromotionProduct,
  type MemberPromotionProductId,
} from "@/lib/points/promotion-products";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";

export const MEMBER_PROMOTION_PRODUCTS_TABLE = "member_promotion_products";

export type MemberPromotionProductLive = MemberPromotionProduct & {
  /** DB 가격 버전 — seed 대체값이면 0 */
  revision: number;
  source: "db" | "seed";
  updatedAt: string | null;
};

type Row = {
  id?: unknown;
  domain?: unknown;
  duration_days?: unknown;
  point_cost?: unknown;
  is_active?: unknown;
  sort_order?: unknown;
  revision?: unknown;
  updated_at?: unknown;
};

function seedLive(p: MemberPromotionProduct): MemberPromotionProductLive {
  return { ...p, revision: 0, source: "seed", updatedAt: null };
}

/** DB 행 + 코드 seed(이름·설명·정책) → 화면·결제용 상품. seed 에 없는 id 는 버린다(임의 상품 생성 없음). */
export function mergeMemberPromotionProductRow(row: Row): MemberPromotionProductLive | null {
  const id = String(row.id ?? "").trim();
  const seed = listMemberPromotionProductSeeds().find((p) => p.id === id);
  if (!seed) return null;
  const pointCost = Math.floor(Number(row.point_cost));
  const durationDays = Math.floor(Number(row.duration_days));
  if (!Number.isFinite(pointCost) || pointCost < 1) return null;
  if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 90) return null;
  return {
    ...seed,
    pointCost,
    durationDays,
    active: row.is_active !== false,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : seed.sortOrder,
    revision: Math.max(0, Math.floor(Number(row.revision) || 0)),
    source: "db",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function loadMemberPromotionProducts(
  sb: SupabaseClient,
  opts?: { domain?: MemberPromotionDomain; includeInactive?: boolean }
): Promise<MemberPromotionProductLive[]> {
  const { data, error } = await sb
    .from(MEMBER_PROMOTION_PRODUCTS_TABLE)
    .select("id, domain, duration_days, point_cost, is_active, sort_order, revision, updated_at");
  let list: MemberPromotionProductLive[];
  if (error) {
    if (!isMissingPointsTable(error.message ?? "", MEMBER_PROMOTION_PRODUCTS_TABLE)) {
      throw new Error(error.message ?? "member_promotion_products_load_failed");
    }
    list = listMemberPromotionProductSeeds().map(seedLive);
  } else {
    list = ((data ?? []) as Row[])
      .map(mergeMemberPromotionProductRow)
      .filter((p): p is MemberPromotionProductLive => p != null);
  }
  return list
    .filter((p) => (opts?.includeInactive ? true : p.active))
    .filter((p) => (opts?.domain ? p.domain === opts.domain : true))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 사용 중인 상품 1개 (꺼진 상품·없는 id → null) */
export async function getMemberPromotionProductLive(
  sb: SupabaseClient,
  productId: string | MemberPromotionProductId
): Promise<MemberPromotionProductLive | null> {
  const id = String(productId ?? "").trim();
  if (!id) return null;
  const list = await loadMemberPromotionProducts(sb);
  return list.find((p) => p.id === id) ?? null;
}

/** 화면에서 본 금액·기간과 지금 값이 같은지 — 보내지 않았으면(옛 화면) 확인하지 않는다 */
export function memberPromotionPriceMatches(
  product: Pick<MemberPromotionProduct, "pointCost" | "durationDays">,
  expected: { pointCost?: unknown; durationDays?: unknown }
): boolean {
  const ec = expected.pointCost;
  const ed = expected.durationDays;
  if (ec != null && Math.floor(Number(ec)) !== product.pointCost) return false;
  if (ed != null && Math.floor(Number(ed)) !== product.durationDays) return false;
  return true;
}
