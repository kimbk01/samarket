import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadMemberPromotionProducts,
  getMemberPromotionProductLive,
  memberPromotionPriceMatches,
  mergeMemberPromotionProductRow,
} from "@/lib/points/member-promotion-products-server";
import { listMemberPromotionProductSeeds } from "@/lib/points/promotion-products";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

function fakeSb(result: { data?: unknown[]; error?: { message: string } | null }): SupabaseClient {
  return {
    from: () => ({ select: async () => ({ data: result.data ?? null, error: result.error ?? null }) }),
  } as unknown as SupabaseClient;
}

const row = (id: string, point_cost: number, duration_days: number, is_active = true, revision = 3) => ({
  id,
  domain: id.startsWith("trade") ? "trade" : "community",
  point_cost,
  duration_days,
  is_active,
  sort_order: 10,
  revision,
  updated_at: "2026-11-03T04:00:00Z",
});

describe("상위노출 가격 = DB 가격표 (Owner 2026-11-03)", () => {
  it("DB 값이 가격·기간·사용 여부를 정한다 (이름·정책은 코드 seed)", async () => {
    const sb = fakeSb({ data: [row("trade_promote_7", 1000, 10), row("trade_promote_14", 900, 14, false)] });
    const list = await loadMemberPromotionProducts(sb, { domain: "trade" });
    expect(list.map((p) => [p.id, p.pointCost, p.durationDays, p.revision, p.source])).toEqual([
      ["trade_promote_7", 1000, 10, 3, "db"],
    ]);
    expect(list[0]!.requiresAdminApproval).toBe(false);
    const all = await loadMemberPromotionProducts(sb, { includeInactive: true });
    expect(all.find((p) => p.id === "trade_promote_14")?.active).toBe(false);
  });

  it("꺼진 상품·없는 id 는 결제 대상이 아니다", async () => {
    const sb = fakeSb({ data: [row("trade_promote_7", 500, 7, false)] });
    expect(await getMemberPromotionProductLive(sb, "trade_promote_7")).toBeNull();
    expect(await getMemberPromotionProductLive(sb, "nope")).toBeNull();
  });

  it("표가 아직 없으면(마이그레이션 전) 코드 처음 값 — 가격 변화 0", async () => {
    const sb = fakeSb({ error: { message: 'relation "public.member_promotion_products" does not exist' } });
    const list = await loadMemberPromotionProducts(sb);
    expect(list.every((p) => p.source === "seed" && p.revision === 0)).toBe(true);
    expect(list.find((p) => p.id === "trade_promote_7")?.pointCost).toBe(500);
  });

  it("다른 오류는 숨기지 않는다 (가격 모름 → 결제 안 함)", async () => {
    const sb = fakeSb({ error: { message: "permission denied" } });
    await expect(loadMemberPromotionProducts(sb)).rejects.toThrow();
  });

  it("seed 에 없는 id·잘못된 값은 버린다", () => {
    expect(mergeMemberPromotionProductRow(row("made_up", 1, 1))).toBeNull();
    expect(mergeMemberPromotionProductRow(row("trade_promote_7", 0, 7))).toBeNull();
    expect(mergeMemberPromotionProductRow(row("trade_promote_7", 500, 91))).toBeNull();
  });

  it("화면 금액·기간이 다르면 불일치 (보내지 않은 옛 화면은 확인 안 함)", () => {
    const p = { pointCost: 1000, durationDays: 7 };
    expect(memberPromotionPriceMatches(p, { pointCost: 500 })).toBe(false);
    expect(memberPromotionPriceMatches(p, { pointCost: 1000, durationDays: 10 })).toBe(false);
    expect(memberPromotionPriceMatches(p, { pointCost: 1000, durationDays: 7 })).toBe(true);
    expect(memberPromotionPriceMatches(p, {})).toBe(true);
  });

  it("마이그레이션 처음 값 = 코드 seed 값 (적용 직후 앱 가격 변화 0)", () => {
    const sql = read("supabase/migrations/20271103130000_member_promotion_products_admin_price.sql");
    for (const s of listMemberPromotionProductSeeds()) {
      expect(sql).toContain(`('${s.id}', '${s.domain}', '${s.placementPolicy}', ${s.durationDays}, ${s.pointCost}, true,`);
    }
  });
});

describe("이미 신청한 광고에는 적용 안 됨 · 변경 내역 · 덮어쓰기 없음", () => {
  const sql = read("supabase/migrations/20271103130000_member_promotion_products_admin_price.sql");

  it("마이그레이션은 기존 주문 금액·기간을 고치지 않는다 (가격 버전 칸 추가만)", () => {
    expect(sql).not.toMatch(/UPDATE\s+public\.point_promotion_orders\s+SET\s+(point_cost|duration_days|end_at|start_at)/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS product_revision/);
  });

  it("어드민 변경 = revision 확인 + 변경 내역 한 트랜잭션 + 사유 필수", () => {
    expect(sql).toMatch(/revision_conflict/);
    expect(sql).toMatch(/INSERT INTO public\.member_promotion_product_changes/);
    expect(sql).toMatch(/reason_required/);
  });

  it("결제 함수 v2 는 가격을 표에서 다시 읽어 다르면 price_changed (차감 전)", () => {
    const v2 = sql.slice(sql.indexOf("purchase_member_content_promotion_v2("));
    expect(v2.indexOf("price_changed")).toBeLessThan(v2.indexOf("public.purchase_member_content_promotion("));
    expect(v2).toMatch(/FOR SHARE/);
  });

  it("새 함수는 서버 키만 실행", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_update_member_promotion_product[^;]+FROM public, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.purchase_member_content_promotion_v2[^;]+FROM public, anon, authenticated/);
  });

  it("결제 API 는 화면 금액을 확인하고 DB 가격으로 결제한다", () => {
    const route = read("app/api/me/points/promotion-orders/route.ts");
    expect(route).toContain("memberPromotionPriceMatches(");
    expect(route).toContain("purchase_member_content_promotion_v2");
    expect(route).toContain('error: "price_changed"');
    expect(route).not.toContain("listActiveMemberPromotionProducts(");
  });

  it("앱 화면은 앱에 묶인 코드 가격을 읽지 않는다", () => {
    const form = read("components/points/PointPromotionOrderForm.tsx");
    expect(form).not.toContain("listActiveMemberPromotionProducts");
    expect(form).toContain("catalog=1&domain=trade");
    expect(form).toContain("expectedPointCost");
    expect(read("components/post/MemberPostPromoteSheet.tsx")).toContain("expectedPointCost");
  });

  it("어드민 화면은 revision·사유를 보내고 충돌이면 새 값으로 다시 그린다", () => {
    const page = read("components/admin/trade-ad-policies/AdminMemberPromotionProductsPage.tsx");
    expect(page).toContain("expectedRevision: p.revision");
    expect(page).toContain("reason: confirmed.reason");
    expect(page).toContain("revision_conflict");
    expect(read("app/admin/trade-ad-policies/page.tsx")).toContain("AdminMemberPromotionProductsPage");
  });
});
